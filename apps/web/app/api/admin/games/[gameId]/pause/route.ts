import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { pauseGame } from "@/lib/game/engine";
import { sanitizeGameForResponse } from "@/lib/game/serialize";

export const runtime = "nodejs";

export const POST = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_PAUSE);
  const game = await pauseGame(params.gameId, ctx.userId);
  return jsonOk({ game: sanitizeGameForResponse(game) });
});
