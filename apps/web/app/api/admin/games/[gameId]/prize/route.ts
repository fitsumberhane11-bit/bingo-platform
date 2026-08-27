import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { setGamePrizeAmount } from "@/lib/game/prize-authority";
import { sanitizeGameForResponse } from "@/lib/game/serialize";

export const runtime = "nodejs";

const schema = z.object({ amount: z.coerce.number().positive() });

// Section 2: the operator sets the authoritative prize amount here. The
// client can never influence this any other way — no purchase, claim, or
// snapshot route ever writes to `Game.operatorPrizeAmount`, only this one,
// permission-gated route does, and setGamePrizeAmount() itself refuses once
// the game is LIVE or later.
export const PATCH = withApiHandler(async (req: NextRequest, { params }: { params: { gameId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_PRIZE_SET);
  const { amount } = schema.parse(await req.json());
  const game = await setGamePrizeAmount(params.gameId, amount, ctx.userId);
  return jsonOk({ game: sanitizeGameForResponse(game) });
});
