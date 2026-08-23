import type { NextResponse } from "next/server";
import { getEnv } from "./env";

export const ACCESS_COOKIE = "bingo_at";
export const REFRESH_COOKIE = "bingo_rt";

export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
): void {
  const env = getEnv();
  const secure = env.NODE_ENV === "production";

  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: env.AUTH_JWT_ACCESS_TTL_SECONDS,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
}
