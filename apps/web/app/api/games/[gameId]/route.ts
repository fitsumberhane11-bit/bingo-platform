import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { getCurrentUser } from "@/lib/current-user";
import { getGameSnapshot } from "@/lib/game/snapshot";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

// Same `getGameSnapshot()` used by the SSE stream's `game:sync` — one
// canonical shape for "current game state," whether fetched once here or
// streamed live.
export const GET = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  const current = await getCurrentUser();
  const snapshot = await getGameSnapshot(params.gameId, current?.sub);
  if (!snapshot) throw new NotFoundError("Game not found.");
  return jsonOk(snapshot);
});
