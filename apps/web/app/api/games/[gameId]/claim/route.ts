import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { submitBingoClaim } from "@/lib/game/claims";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({
  ticketId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
});

// Any authenticated player may submit a claim for their OWN ticket — this is
// deliberately not RBAC-gated like the admin routes, the same way ticket
// purchase isn't: ownership (checked inside submitBingoClaim) is the only
// authorization that matters here.
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { gameId: string } }) => {
  const current = await requireCurrentUser();
  await enforceRateLimit(`bingo-claim:${current.sub}`, 20, 60 * 5);
  await enforceRateLimit(`bingo-claim:ip:${getClientIp(req)}`, 40, 60 * 5);

  const input = schema.parse(await req.json());
  const result = await submitBingoClaim({ gameId: params.gameId, ticketId: input.ticketId, userId: current.sub, stageId: input.stageId });

  return jsonOk(
    {
      claimId: result.claim.id,
      won: result.won,
      validationStatus: result.claim.validationStatus,
      invalidReason: result.claim.invalidReason,
      penalty: result.penalty,
    },
    { status: 201 },
  );
});
