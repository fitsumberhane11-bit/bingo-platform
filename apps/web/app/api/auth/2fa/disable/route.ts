import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { disableTwoFactor } from "@/lib/two-factor-service";

export const runtime = "nodejs";

const schema = z.object({ currentPassword: z.string().min(1) });

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const { currentPassword } = schema.parse(await req.json());
  await disableTwoFactor(current.sub, currentPassword);
  return jsonOk({ disabled: true });
});
