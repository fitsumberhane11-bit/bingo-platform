import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { transitionWithdrawal } from "@/lib/withdrawal-service";

export const runtime = "nodejs";

export const POST = withApiHandler(async (_req: Request, { params }: { params: { withdrawalId: string } }) => {
  const current = await requireCurrentUser();
  const withdrawal = await transitionWithdrawal({
    withdrawalId: params.withdrawalId,
    action: "CANCEL",
    actorUserId: current.sub,
    isPlayerSelfCancel: true,
  });
  return jsonOk({ withdrawal });
});
