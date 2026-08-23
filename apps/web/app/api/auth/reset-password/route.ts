import type { NextRequest } from "next/server";
import { resetPasswordSchema } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { resetPassword } from "@/lib/auth-service";
import { getClientIp } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  await enforceRateLimit(`reset-password:ip:${getClientIp(req)}`, 10, 15 * 60);

  const body = await req.json();
  const input = resetPasswordSchema.parse(body);
  await resetPassword(input);

  return jsonOk({ message: "Password updated. You can now log in with your new password." });
});
