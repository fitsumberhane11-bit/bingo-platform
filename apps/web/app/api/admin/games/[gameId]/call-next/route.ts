import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { callNextNumber } from "@/lib/game/engine";
import { ConflictError } from "@/lib/errors";

export const runtime = "nodejs";

// The operator only controls WHEN this fires — callNextNumber() itself
// determines WHICH ball comes next, by reading the next position in the
// pre-committed, cryptographically-derived sequence. No input from this
// request can influence that choice.
export const POST = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_CALL_NUMBER);
  const result = await callNextNumber(params.gameId, ctx.userId);
  if (!result) throw new ConflictError("All 75 numbers have been called; the game has ended.");
  return jsonOk({ call: result });
});
