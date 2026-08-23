import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { verifyEmailToken } from "@/lib/auth-service";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(10) });

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { token } = schema.parse(body);
  await verifyEmailToken(token);
  return jsonOk({ verified: true });
});
