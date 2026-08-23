import { prisma } from "@bingo/db";
import { RateLimitError } from "./errors";

/**
 * Persisted (DB-backed, survives restarts) brute-force protection, layered
 * on top of the request-level `enforceRateLimit`. Rate limiting throttles
 * request *volume*; this throttles *guesses against one identifier*
 * regardless of which IP they come from.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

export async function assertNotLockedOut(identifier: string): Promise<void> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);
  const recentFailures = await prisma.loginAttempt.count({
    where: { identifier: identifier.toLowerCase(), success: false, createdAt: { gte: since } },
  });
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    throw new RateLimitError(
      `Too many failed login attempts. Try again in ${LOCKOUT_WINDOW_MINUTES} minutes.`,
      LOCKOUT_WINDOW_MINUTES * 60,
    );
  }
}

export async function recordLoginAttempt(input: {
  identifier: string;
  userId?: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      identifier: input.identifier.toLowerCase(),
      userId: input.userId,
      success: input.success,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}
