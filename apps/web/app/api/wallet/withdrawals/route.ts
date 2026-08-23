import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { listWithdrawals } from "@/lib/withdrawal-service";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const result = await listWithdrawals({ userId: current.sub }, 1, 20);
  return jsonOk(result);
});
