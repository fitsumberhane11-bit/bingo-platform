import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { confirmBingoClaim } from "@/lib/game/claims";

export const runtime = "nodejs";

export const POST = withApiHandler(async (_req: Request, { params }: { params: { claimId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_CLAIM_CONFIRM);
  const result = await confirmBingoClaim(params.claimId, ctx.userId);
  return jsonOk({
    confirmed: result.confirmed.map((c) => c.id),
    rejected: result.rejected.map((c) => c.id),
  });
});
