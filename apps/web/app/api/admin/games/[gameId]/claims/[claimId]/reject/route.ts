import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { rejectBingoClaim } from "@/lib/game/claims";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required to reject a claim.") });

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { claimId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_CLAIM_CONFIRM);
  const { reason } = schema.parse(await req.json());
  const claim = await rejectBingoClaim(params.claimId, ctx.userId, reason);
  return jsonOk({ claim: { id: claim.id, confirmationStatus: claim.confirmationStatus } });
});
