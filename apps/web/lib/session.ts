import { prisma } from "@bingo/db";
import { AuthError } from "./errors";
import { generateOpaqueToken, sha256Hex } from "./crypto";
import { signAccessToken } from "./jwt";
import { getEnv } from "./env";
import { loadAccessContext } from "./rbac-server";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function buildAccessToken(userId: string, username: string, sessionId: string) {
  const ctx = await loadAccessContext(userId);
  return signAccessToken({
    sub: userId,
    username,
    roles: ctx.roles,
    permissions: Array.from(ctx.permissions),
    sessionId,
  });
}

export async function createSession(
  user: { id: string; username: string },
  ipAddress: string,
  userAgent: string,
): Promise<IssuedTokens> {
  const env = getEnv();
  const refreshToken = generateOpaqueToken(32);
  const refreshExpiresAt = new Date(Date.now() + env.AUTH_JWT_REFRESH_TTL_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: sha256Hex(refreshToken),
      ipAddress,
      userAgent,
      expiresAt: refreshExpiresAt,
    },
  });

  const accessToken = await buildAccessToken(user.id, user.username, session.id);
  return { accessToken, refreshToken, refreshExpiresAt };
}

/**
 * Rotates a refresh token: the presented token is immediately invalidated
 * and a new one issued. If a token that was already rotated (revoked) is
 * presented again, that's a strong signal of token theft/replay — every
 * session for that user is revoked and the caller must re-authenticate.
 */
export async function rotateSession(
  rawRefreshToken: string,
  ipAddress: string,
  userAgent: string,
): Promise<IssuedTokens> {
  const tokenHash = sha256Hex(rawRefreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: tokenHash }, include: { user: true } });

  if (!session) throw new AuthError("Invalid session. Please log in again.");

  if (session.revokedAt || session.expiresAt < new Date()) {
    if (session.revokedAt) {
      // Reused/rotated-away token presented again — treat as compromise.
      await prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new AuthError("Session expired or revoked. Please log in again.");
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

  return createSession({ id: session.user.id, username: session.user.username }, ipAddress, userAgent);
}

export async function revokeSessionByRefreshToken(rawRefreshToken: string): Promise<void> {
  const tokenHash = sha256Hex(rawRefreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
