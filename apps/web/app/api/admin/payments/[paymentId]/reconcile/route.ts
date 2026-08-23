import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { reconcilePayment } from "@/lib/payment-service";

export const runtime = "nodejs";

export const POST = withApiHandler(async (_req: Request, { params }: { params: { paymentId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.PAYMENT_RECONCILE);
  const result = await reconcilePayment(params.paymentId, ctx.userId);
  return jsonOk(result);
});
