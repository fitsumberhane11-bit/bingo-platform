import { randomBytes } from "node:crypto";
import { generateSecret, verify, generateURI } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@bingo/db";
import { encryptSecret, decryptSecret } from "./crypto";
import { hashPassword, verifyPassword } from "./password";
import { AuthError, ValidationError } from "./errors";
import { writeAuditLog } from "./audit";
import { getEnv } from "./env";

const RECOVERY_CODE_COUNT = 10;

function formatRecoveryCode(): string {
  // XXXX-XXXX, base32-ish alphabet (no ambiguous 0/O/1/I) for easy manual entry.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i]! % alphabet.length];
    if (i === 3) code += "-";
  }
  return code;
}

/**
 * Starts enrollment: generates a new secret and returns a QR code data URI
 * plus the raw secret (for manual entry). The secret is NOT persisted yet —
 * only written to the user row once confirmEnrollment() verifies the user
 * can actually produce a valid code with it, so an abandoned enrollment
 * never leaves a half-configured, unusable 2FA state.
 */
export async function startEnrollment(userId: string, username: string): Promise<{ secret: string; qrCodeDataUri: string }> {
  const env = getEnv();
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: env.APP_NAME, label: username, secret });
  const qrCodeDataUri = await QRCode.toDataURL(otpauthUrl);
  return { secret, qrCodeDataUri };
}

/**
 * Confirms enrollment: verifies the user's device actually produces a valid
 * code for the given secret, then persists the encrypted secret and issues
 * one-time recovery codes (returned once, in plaintext, never retrievable
 * again — only their argon2 hashes are stored).
 */
export async function confirmEnrollment(userId: string, secret: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const result = await verify({ token: code, secret });
  if (!result.valid) throw new ValidationError("Invalid verification code. Check your authenticator app and try again.");

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, formatRecoveryCode);
  const hashedCodes = await Promise.all(recoveryCodes.map((c) => hashPassword(c)));

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorSecret: encryptSecret(secret) } }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }), // clear any codes from a prior enrollment
    prisma.twoFactorRecoveryCode.createMany({ data: hashedCodes.map((codeHash) => ({ userId, codeHash })) }),
  ]);

  await writeAuditLog({ actorUserId: userId, action: "TWO_FACTOR_ENABLED", entityType: "User", entityId: userId });
  return { recoveryCodes };
}

/** Disables 2FA. Requires the current password as re-authentication for this sensitive change. */
export async function disableTwoFactor(userId: string, currentPassword: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const validPassword = await verifyPassword(user.passwordHash, currentPassword);
  if (!validPassword) throw new AuthError("Incorrect password.");

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
  ]);
  await writeAuditLog({ actorUserId: userId, action: "TWO_FACTOR_DISABLED", entityType: "User", entityId: userId });
}

/**
 * Verifies a login-time 2FA code — either a live TOTP code or an unused
 * recovery code (consumed on success, never reusable). Never throws with a
 * message distinguishing "wrong TOTP" from "wrong recovery code" — both
 * just fail closed the same way, avoiding a signal an attacker could use
 * to narrow down which code type a stolen partial credential matches.
 */
export async function verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return false;

  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed)) {
    const secret = decryptSecret(user.twoFactorSecret);
    const result = await verify({ token: trimmed, secret });
    if (result.valid) return true;
  }

  // Fall through to recovery codes for anything that isn't a bare 6-digit
  // TOTP code (covers the XXXX-XXXX format and bare 8-char entry alike).
  const candidates = await prisma.twoFactorRecoveryCode.findMany({ where: { userId, usedAt: null } });
  for (const candidate of candidates) {
    if (await verifyPassword(candidate.codeHash, trimmed.toUpperCase())) {
      await prisma.twoFactorRecoveryCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
      await writeAuditLog({ actorUserId: userId, action: "TWO_FACTOR_RECOVERY_CODE_USED", entityType: "User", entityId: userId, newValue: { recoveryCodeId: candidate.id } });
      return true;
    }
  }
  return false;
}

export async function getRemainingRecoveryCodeCount(userId: string): Promise<number> {
  return prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
}
