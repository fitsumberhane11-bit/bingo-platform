import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSuccess } from "@bingo/shared-types";
import { withApiHandler } from "@/lib/api-handler";
import { AuthError } from "@/lib/errors";
import { completeTwoFactorLogin } from "@/lib/auth-service";
import { verifyTwoFactorChallenge } from "@/lib/two-factor-challenge";
import { verifyTwoFactorCode } from "@/lib/two-factor-service";
import { getClientIp, getUserAgent } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { setAuthCookies } from "@/lib/cookies";

export const runtime = "nodejs";

const schema = z.object({ challengeToken: z.string().min(1), code: z.string().min(1).max(16) });

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  await enforceRateLimit(`2fa-verify:ip:${ip}`, 20, 15 * 60);

  const { challengeToken, code } = schema.parse(await req.json());
  const userId = await verifyTwoFactorChallenge(challengeToken);
  if (!userId) throw new AuthError("This verification session has expired. Please log in again.");

  await enforceRateLimit(`2fa-verify:user:${userId}`, 10, 15 * 60);

  const valid = await verifyTwoFactorCode(userId, code);
  if (!valid) throw new AuthError("Invalid verification code.");

  const result = await completeTwoFactorLogin(userId, { ipAddress: ip, userAgent: getUserAgent(req) });
  const res = NextResponse.json(apiSuccess({ user: result.user }));
  setAuthCookies(res, result.tokens);
  return res;
});
