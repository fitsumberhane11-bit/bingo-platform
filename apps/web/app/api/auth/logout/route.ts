import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiSuccess } from "@bingo/shared-types";
import { withApiHandler } from "@/lib/api-handler";
import { logoutUser } from "@/lib/auth-service";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/cookies";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  await logoutUser(refreshToken);

  const res = NextResponse.json(apiSuccess({ loggedOut: true }));
  clearAuthCookies(res);
  return res;
});
