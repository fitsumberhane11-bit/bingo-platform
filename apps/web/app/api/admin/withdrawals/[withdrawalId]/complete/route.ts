import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { transitionWithdrawal } from "@/lib/withdrawal-service";

export const runtime = "nodejs";

export const POST = withApiHandler(async (_req: Request, { params }: { params: { withdrawalId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.WITHDRAWAL_APPROVE);
  const withdrawal = await transitionWithdrawal({ withdrawalId: params.withdrawalId, action: "MARK_COMPLETED", actorUserId: ctx.userId });
  return jsonOk({ withdrawal });
});
