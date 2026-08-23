import type { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requestPasswordReset } from "@/lib/auth-service";
import { getClientIp, getUserAgent } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  await enforceRateLimit(`forgot-password:ip:${ip}`, 5, 15 * 60);

  const body = await req.json();
  const input = forgotPasswordSchema.parse(body);
  await enforceRateLimit(`forgot-password:id:${input.identifier.toLowerCase()}`, 3, 15 * 60);

  await requestPasswordReset(input, { ipAddress: ip, userAgent: getUserAgent(req) });

  // Always the same response, whether or not the account exists.
  return jsonOk({ message: "If an account exists for that email or phone, a reset link has been sent." });
});
