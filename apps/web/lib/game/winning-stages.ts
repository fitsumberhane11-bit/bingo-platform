import { Prisma, prisma, type GameStatus, type WinningStage } from "@bingo/db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { writeAuditLog } from "../audit";

export interface WinningStageInput {
  order: number;
  patternId: string;
  label?: string;
  prizeAmount: number;
  winnerLimit?: number;
}

/** Stages may only be (re)configured before the game goes LIVE — same lock point as the prize amount. */
const STAGES_LOCKED_STATUSES: readonly GameStatus[] = ["LIVE", "PAUSED", "COMPLETED", "CANCELLED"];

/**
 * Replaces a game's full set of winning stages (Section 6 — "1st Prize: Four
 * Corners", "Final Prize: Full House", etc). A game with zero stages falls
 * back to its legacy single winningPatternId/prizeRule behavior everywhere
 * else in the codebase (claims.ts, snapshot.ts) — this function is the only
 * writer of WinningStage rows, so that fallback stays reliable.
 */
export async function setWinningStages(gameId: string, stages: WinningStageInput[], actorId: string): Promise<WinningStage[]> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new NotFoundError("Game not found.");
  if (STAGES_LOCKED_STATUSES.includes(game.status)) {
    throw new ConflictError(`Winning stages cannot be changed once the game is ${game.status}.`);
  }
  if (stages.length === 0) throw new ValidationError("At least one winning stage is required, or omit stages entirely to use the legacy single-pattern mode.");

  const orders = new Set<number>();
  for (const s of stages) {
    if (!(s.prizeAmount > 0)) throw new ValidationError(`Stage "${s.label ?? s.order}" must have a positive prize amount.`);
    if (s.winnerLimit != null && s.winnerLimit < 1) throw new ValidationError(`Stage "${s.label ?? s.order}" must allow at least 1 winner.`);
    if (orders.has(s.order)) throw new ValidationError(`Duplicate stage order: ${s.order}.`);
    orders.add(s.order);
  }

  const patternIds = [...new Set(stages.map((s) => s.patternId))];
  const foundPatterns = await prisma.winningPattern.findMany({ where: { id: { in: patternIds } } });
  if (foundPatterns.length !== patternIds.length) throw new ValidationError("One or more winning patterns were not found.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.winningStage.deleteMany({ where: { gameId, status: "ACTIVE" } }); // never deletes a COMPLETED stage's history
    const created: WinningStage[] = [];
    for (const s of stages) {
      created.push(
        await tx.winningStage.create({
          data: {
            gameId,
            order: s.order,
            patternId: s.patternId,
            label: s.label,
            prizeAmount: new Prisma.Decimal(s.prizeAmount),
            winnerLimit: s.winnerLimit ?? 1,
          },
        }),
      );
    }
    return created;
  });

  await prisma.gameEvent.create({
    data: { gameId, type: "RULES_CONFIGURED", payload: { actorId, stageCount: stages.length } },
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: "GAME_RULES_CONFIGURED",
    entityType: "Game",
    entityId: gameId,
    newValue: { stages: stages.map((s) => ({ order: s.order, patternId: s.patternId, prizeAmount: s.prizeAmount, winnerLimit: s.winnerLimit ?? 1 })) },
  });

  return result;
}

export async function listWinningStages(gameId: string): Promise<(WinningStage & { pattern: { name: string } })[]> {
  return prisma.winningStage.findMany({ where: { gameId }, include: { pattern: { select: { name: true } } }, orderBy: { order: "asc" } });
}
