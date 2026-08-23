import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiSuccess } from "@bingo/shared-types";
import { withApiHandler } from "@/lib/api-handler";
import { rotateSession } from "@/lib/session";
import { REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from "@/lib/cookies";
import { getClientIp, getUserAgent } from "@/lib/request";
import { AuthError } from "@/lib/errors";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) throw new AuthError("No active session.");

  try {
    const tokens = await rotateSession(refreshToken, getClientIp(req), getUserAgent(req));
    const res = NextResponse.json(apiSuccess({ refreshed: true }));
    setAuthCookies(res, tokens);
    return res;
  } catch (err) {
    const message = err instanceof AuthError ? err.message : "Session expired. Please log in again.";
    const res = NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message } },
      { status: 401 },
    );
    clearAuthCookies(res);
    return res;
  }
});
