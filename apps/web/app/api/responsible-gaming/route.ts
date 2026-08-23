import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { getEffectiveLimits, updateLimits } from "@/lib/responsible-gaming-service";

export const runtime = "nodejs";

const schema = z.object({
  dailyDepositLimit: z.number().positive().nullable().optional(),
  weeklyDepositLimit: z.number().positive().nullable().optional(),
  dailySpendLimit: z.number().positive().nullable().optional(),
  weeklySpendLimit: z.number().positive().nullable().optional(),
});

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const limits = await getEffectiveLimits(current.sub);
  return jsonOk({ limits });
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const input = schema.parse(await req.json());
  await updateLimits(current.sub, input, current.sub);
  const limits = await getEffectiveLimits(current.sub);
  return jsonOk({ limits });
});
