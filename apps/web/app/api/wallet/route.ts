import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { getWalletSummary } from "@/lib/wallet-service";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const wallet = await getWalletSummary(current.sub);
  return jsonOk({ wallet });
});
