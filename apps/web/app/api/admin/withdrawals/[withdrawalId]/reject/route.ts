import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { transitionWithdrawal } from "@/lib/withdrawal-service";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required to reject a withdrawal.") });

export const POST = withApiHandler(async (req: Request, { params }: { params: { withdrawalId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.WITHDRAWAL_REJECT);
  const { reason } = schema.parse(await req.json());
  const withdrawal = await transitionWithdrawal({ withdrawalId: params.withdrawalId, action: "REJECT", actorUserId: ctx.userId, reason });
  return jsonOk({ withdrawal });
});
