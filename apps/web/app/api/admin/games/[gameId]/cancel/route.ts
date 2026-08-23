import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { cancelGame } from "@/lib/game/engine";
import { sanitizeGameForResponse } from "@/lib/game/serialize";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required to cancel a game.") });

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { gameId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_CANCEL);
  const { reason } = schema.parse(await req.json());
  const game = await cancelGame(params.gameId, ctx.userId, reason);
  return jsonOk({ game: sanitizeGameForResponse(game) });
});
