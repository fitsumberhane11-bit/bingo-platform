import { prisma } from "@bingo/db";
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from "@bingo/shared-types";
import { normalizeEthiopianPhone, ROLES } from "@bingo/shared-types";
import { hashPassword, verifyPassword } from "./password";
import { AuthError, ConflictError, MaintenanceModeError, ValidationError } from "./errors";
import { isRegistrationEnabled } from "./system-settings";
import { assertNotLockedOut, recordLoginAttempt } from "./login-guard";
import { createSession, revokeSessionByRefreshToken, revokeAllSessionsForUser, type IssuedTokens } from "./session";
import { writeAuditLog } from "./audit";
import { generateOpaqueToken, sha256Hex } from "./crypto";
import { getEmailProvider } from "./notifications";
import { getEnv } from "./env";
import { signTwoFactorChallenge } from "./two-factor-challenge";

export interface PublicUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  status: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
}

function toPublicUser(user: {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  status: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
  };
}

async function generateUniqueReferralCode(base: string): Promise<string> {
  const sanitizedBase = base.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "PLAYER";
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${sanitizedBase}${suffix}`;
    const existing = await prisma.user.findUnique({ where: { referralCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Unable to generate a unique referral code after multiple attempts.");
}

export async function registerUser(
  input: RegisterInput,
  context: { ipAddress: string; userAgent: string },
): Promise<PublicUser> {
  if (!(await isRegistrationEnabled())) {
    throw new MaintenanceModeError("New registrations are temporarily paused. Please try again later.");
  }

  const normalizedPhone = normalizeEthiopianPhone(input.phone);
  if (!normalizedPhone) throw new ValidationError("Invalid phone number.", { phone: ["Invalid Ethiopian phone number."] });

  const [existingUsername, existingEmail, existingPhone] = await Promise.all([
    prisma.user.findUnique({ where: { username: input.username } }),
    prisma.user.findUnique({ where: { email: input.email.toLowerCase() } }),
    prisma.user.findUnique({ where: { phone: normalizedPhone } }),
  ]);
  if (existingUsername) throw new ConflictError("Username is already taken.");
  if (existingEmail) throw new ConflictError("An account with this email already exists.");
  if (existingPhone) throw new ConflictError("An account with this phone number already exists.");

  let referredById: string | undefined;
  if (input.referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: input.referralCode } });
    if (!referrer) {
      throw new ValidationError("Invalid referral code.", { referralCode: ["This referral code does not exist."] });
    }
    referredById = referrer.id;
  }

  const passwordHash = await hashPassword(input.password);
  const referralCode = await generateUniqueReferralCode(input.username);
  const playerRole = await prisma.role.findUnique({ where: { name: ROLES.PLAYER } });
  if (!playerRole) throw new Error("PLAYER role is not seeded. Run the database seed script.");

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName,
        username: input.username,
        email: input.email.toLowerCase(),
        phone: normalizedPhone,
        passwordHash,
        referralCode,
        referredById,
        termsAcceptedAt: new Date(),
        status: "PENDING_VERIFICATION",
        roles: { create: { roleId: playerRole.id } },
        wallet: { create: { availableBalance: 0, pendingBalance: 0 } },
      },
    });
    return created;
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "USER_REGISTERED",
    entityType: "User",
    entityId: user.id,
    newValue: { username: user.username, email: user.email, referredById: referredById ?? null },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  await sendEmailVerification(user.id, user.email);

  return toPublicUser(user);
}

export async function sendEmailVerification(userId: string, email: string): Promise<void> {
  const rawToken = generateOpaqueToken(24);
  await prisma.verificationToken.create({
    data: {
      userId,
      type: "EMAIL_VERIFICATION",
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const env = getEnv();
  const link = `${env.APP_URL}/verify-email?token=${rawToken}`;
  await getEmailProvider().sendEmail({
    to: email,
    subject: "Verify your Ethiopia Bingo account",
    html: `<p>Welcome! Please verify your email by clicking the link below:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
    text: `Verify your account: ${link}`,
  });
}

export async function verifyEmailToken(rawToken: string): Promise<void> {
  const tokenHash = sha256Hex(rawToken);
  const token = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!token || token.type !== "EMAIL_VERIFICATION" || token.consumedAt || token.expiresAt < new Date()) {
    throw new AuthError("This verification link is invalid or has expired.");
  }
  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: new Date(), status: "ACTIVE" },
    }),
  ]);
  await writeAuditLog({
    actorUserId: token.userId,
    action: "EMAIL_VERIFIED",
    entityType: "User",
    entityId: token.userId,
  });
}

export interface LoginResult {
  twoFactorRequired: false;
  user: PublicUser;
  tokens: IssuedTokens;
}

export interface TwoFactorChallengeResult {
  twoFactorRequired: true;
  challengeToken: string;
}

async function finishLogin(
  user: { id: string; username: string },
  context: { ipAddress: string; userAgent: string },
): Promise<LoginResult> {
  const tokens = await createSession({ id: user.id, username: user.username }, context.ipAddress, context.userAgent);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAuditLog({
    actorUserId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return { twoFactorRequired: false, user: toPublicUser(updated), tokens };
}

export async function loginUser(
  input: LoginInput,
  context: { ipAddress: string; userAgent: string },
): Promise<LoginResult | TwoFactorChallengeResult> {
  const identifier = input.identifier.trim();
  await assertNotLockedOut(identifier);

  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: identifier },
        { email: identifier.toLowerCase() },
        { phone: identifier },
      ],
    },
  });

  if (!user) {
    await recordLoginAttempt({ identifier, success: false, ipAddress: context.ipAddress, userAgent: context.userAgent });
    throw new AuthError("Invalid username/email/phone or password.");
  }

  const validPassword = await verifyPassword(user.passwordHash, input.password);
  if (!validPassword) {
    await recordLoginAttempt({
      identifier,
      userId: user.id,
      success: false,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    throw new AuthError("Invalid username/email/phone or password.");
  }

  if (user.status === "SUSPENDED") throw new AuthError("Your account has been suspended. Contact support.");
  if (user.status === "BANNED") throw new AuthError("Your account has been banned.");
  if (user.status === "DELETED") throw new AuthError("Invalid username/email/phone or password.");

  // Password is correct — this resolves the identifier's brute-force
  // lockout regardless of what happens with 2FA next (2FA attempts are
  // rate-limited separately, keyed by the challenge/user, not this
  // identifier-based guard).
  await recordLoginAttempt({
    identifier,
    userId: user.id,
    success: true,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (user.twoFactorEnabled) {
    const challengeToken = await signTwoFactorChallenge(user.id);
    return { twoFactorRequired: true, challengeToken };
  }

  return finishLogin(user, context);
}

export async function completeTwoFactorLogin(
  userId: string,
  context: { ipAddress: string; userAgent: string },
): Promise<LoginResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status === "SUSPENDED") throw new AuthError("Your account has been suspended. Contact support.");
  if (user.status === "BANNED") throw new AuthError("Your account has been banned.");
  return finishLogin(user, context);
}

export async function logoutUser(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await revokeSessionByRefreshToken(refreshToken);
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
  context: { ipAddress: string; userAgent: string },
): Promise<void> {
  const identifier = input.identifier.trim();
  const user = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ email: identifier.toLowerCase() }, { phone: identifier }] },
  });

  // Always behave the same whether or not the account exists, to avoid
  // leaking which emails/phones are registered.
  if (!user) return;

  const rawToken = generateOpaqueToken(24);
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      type: "PASSWORD_RESET",
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      requestIp: context.ipAddress,
    },
  });

  const env = getEnv();
  const link = `${env.APP_URL}/reset-password?token=${rawToken}`;
  await getEmailProvider().sendEmail({
    to: user.email,
    subject: "Reset your Ethiopia Bingo password",
    html: `<p>We received a request to reset your password. This link expires in 30 minutes.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    text: `Reset your password: ${link}`,
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    ipAddress: context.ipAddress,
  });
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = sha256Hex(input.token);
  const token = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!token || token.type !== "PASSWORD_RESET" || token.consumedAt || token.expiresAt < new Date()) {
    throw new AuthError("This password reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: token.userId }, data: { passwordHash } }),
  ]);
  await revokeAllSessionsForUser(token.userId);
  await writeAuditLog({
    actorUserId: token.userId,
    action: "PASSWORD_RESET_COMPLETED",
    entityType: "User",
    entityId: token.userId,
  });
}
