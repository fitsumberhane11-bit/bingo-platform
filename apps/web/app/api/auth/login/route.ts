import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { loginSchema } from "@bingo/shared-types";
import { withApiHandler } from "@/lib/api-handler";
import { apiSuccess } from "@bingo/shared-types";
import { loginUser } from "@/lib/auth-service";
import { getClientIp, getUserAgent } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { setAuthCookies } from "@/lib/cookies";
import { defaultLandingPath, loadAccessContext } from "@/lib/rbac-server";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  await enforceRateLimit(`login:ip:${ip}`, 20, 15 * 60);

  const body = await req.json();
  const input = loginSchema.parse(body);
  await enforceRateLimit(`login:id:${input.identifier.toLowerCase()}`, 10, 15 * 60);

  const result = await loginUser(input, { ipAddress: ip, userAgent: getUserAgent(req) });

  if (result.twoFactorRequired) {
    return NextResponse.json(apiSuccess({ twoFactorRequired: true, challengeToken: result.challengeToken }));
  }

  const landingPath = defaultLandingPath(await loadAccessContext(result.user.id));
  const res = NextResponse.json(apiSuccess({ user: result.user, landingPath }));
  setAuthCookies(res, result.tokens);
  return res;
});
