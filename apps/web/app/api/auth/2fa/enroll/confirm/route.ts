import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { confirmEnrollment } from "@/lib/two-factor-service";

export const runtime = "nodejs";

const schema = z.object({ secret: z.string().min(1), code: z.string().min(6).max(6) });

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const { secret, code } = schema.parse(await req.json());
  const { recoveryCodes } = await confirmEnrollment(current.sub, secret, code);
  return jsonOk({ recoveryCodes });
});
