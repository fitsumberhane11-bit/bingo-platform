import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { setWinningStages, listWinningStages } from "@/lib/game/winning-stages";

export const runtime = "nodejs";

const stageSchema = z.object({
  order: z.number().int().min(1),
  patternId: z.string().uuid(),
  label: z.string().trim().max(80).optional(),
  prizeAmount: z.number().positive(),
  winnerLimit: z.number().int().min(1).max(1000).optional(),
});
// Capped at 3: this is the "multiple games in one session" feature — each
// stage is its own bingo round (own pattern, own prize) played against the
// same running call sequence and the same cards, e.g. "Game 1: One Line"
// then "Game 2: Two Lines" then "Game 3: Full House". A game with zero
// stages configured falls back to its legacy single-pattern behavior
// (game.winningPatternId / prizeRuleId) everywhere else.
const schema = z.object({ stages: z.array(stageSchema).min(1).max(3) });

// Section 6 — an operator configures one or more prize tiers for a game
// ("1st Prize: Four Corners, ETB 100" ... "Final Prize: Full House, ETB
// 250"). Replaces the full set each call; a game with no rows here falls
// back to its legacy single-pattern behavior everywhere else.
export const PUT = withApiHandler(async (req: NextRequest, { params }: { params: { gameId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_RULES_SET);
  const { stages } = schema.parse(await req.json());
  const created = await setWinningStages(params.gameId, stages, ctx.userId);
  return jsonOk({ stages: created });
});

export const GET = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  await requireApiPermission(PERMISSIONS.GAME_VIEW);
  const stages = await listWinningStages(params.gameId);
  return jsonOk({ stages });
});
