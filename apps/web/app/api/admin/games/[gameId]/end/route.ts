import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { endGame } from "@/lib/game/engine";
import { sanitizeGameForResponse } from "@/lib/game/serialize";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().max(500).optional() });

// Section 26's explicit "END GAME" control — distinct from the automatic
// forfeit-completion in engine.ts (all 75 called, no winner).
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { gameId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_END);
  const { reason } = schema.parse(await req.json().catch(() => ({})));
  const game = await endGame(params.gameId, ctx.userId, reason);
  return jsonOk({ game: sanitizeGameForResponse(game) });
});
