import { cookies } from "next/headers";
import { prisma } from "@bingo/db";
import { ACCESS_COOKIE } from "./cookies";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt";
import { AuthError } from "./errors";

export interface CurrentUser extends AccessTokenClaims {
  status: string;
}

/**
 * Reads and verifies the access token cookie. Also re-checks the user's
 * account status against the DB (not just the JWT) so a suspension takes
 * effect immediately instead of waiting for the token to expire.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { status: true, deletedAt: true } });
  if (!user || user.deletedAt || user.status === "SUSPENDED" || user.status === "BANNED" || user.status === "DELETED") {
    return null;
  }

  return { ...claims, status: user.status };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be logged in to perform this action.");
  return user;
}
