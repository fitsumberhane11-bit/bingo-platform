import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { requestWithdrawal, getWithdrawalLimits } from "@/lib/withdrawal-service";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.number().positive(),
  provider: z.enum(["TELEBIRR", "CBE"]),
  destinationAccount: z.string().trim().min(3).max(64),
});

export const GET = withApiHandler(async () => {
  await requireCurrentUser();
  const limits = await getWithdrawalLimits();
  return jsonOk({ limits });
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const input = schema.parse(await req.json());
  const withdrawal = await requestWithdrawal({ userId: current.sub, ...input });
  return jsonOk({ withdrawal });
});
