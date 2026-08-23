import type { NextRequest } from "next/server";
import { registerSchema } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { registerUser } from "@/lib/auth-service";
import { getClientIp, getUserAgent } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  await enforceRateLimit(`register:ip:${ip}`, 10, 60 * 60);

  const body = await req.json();
  const input = registerSchema.parse(body);

  const user = await registerUser(input, { ipAddress: ip, userAgent: getUserAgent(req) });

  return jsonOk(
    { user, message: "Account created. Check your email to verify your account before depositing or playing." },
    { status: 201 },
  );
});
