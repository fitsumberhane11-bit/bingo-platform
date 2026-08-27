import { Prisma, prisma, type Game, type GameStatus } from "@bingo/db";
import { calculatePrizePool, type PrizeRuleConfig } from "@bingo/game-core";
import { ConflictError, ValidationError } from "../errors";
import { writeAuditLog } from "../audit";

/** Statuses at which the operator-set prize amount is locked — Section 2: "cannot be modified after the game reaches LIVE status." */
const PRIZE_LOCKED_STATUSES: readonly GameStatus[] = ["LIVE", "PAUSED", "COMPLETED", "CANCELLED"];

/**
 * The single authoritative read path for a game's prize. If the operator has
 * explicitly set one, that is the ONE true prize — the server never derives
 * it from ticket sales in that case, and the client can never influence it
 * (this function only ever reads `game.operatorPrizeAmount`, a column no
 * ticket-purchase or claim endpoint ever writes to). Falls back to the
 * legacy sales-derived calculation for games created before this existed, or
 * where the operator deliberately left it unset.
 */
export async function resolveGamePrizePool(game: Game, prizeRule: { config: Prisma.JsonValue }): Promise<Prisma.Decimal> {
  if (game.operatorPrizeAmount != null) return game.operatorPrizeAmount;

  const salesAgg = await prisma.bingoTicket.aggregate({ where: { gameId: game.id }, _sum: { purchasePrice: true } });
  const ticketSalesTotal = salesAgg._sum.purchasePrice ?? new Prisma.Decimal(0);
  return calculatePrizePool(prizeRule.config as unknown as PrizeRuleConfig, ticketSalesTotal, game.jackpotAmount);
}

/**
 * Operator sets/changes the authoritative prize amount for a game (Section
 * 2). Validated server-side: amount > 0, and only while the game hasn't gone
 * LIVE yet — once it has, the prize is locked for the rest of the game's
 * life, exactly per spec.
 */
export async function setGamePrizeAmount(gameId: string, amount: number, actorId: string): Promise<Game> {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new ValidationError("Prize amount must be a positive number.");
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new ValidationError("Game not found.");
  if (PRIZE_LOCKED_STATUSES.includes(game.status)) {
    throw new ConflictError(`Prize amount cannot be changed once the game is ${game.status}.`);
  }

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: { operatorPrizeAmount: new Prisma.Decimal(amount) },
  });

  await prisma.gameEvent.create({
    data: { gameId, type: "PRIZE_CONFIGURED", payload: { amount, actorId, previousAmount: game.operatorPrizeAmount?.toString() ?? null } },
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: "GAME_PRIZE_CONFIGURED",
    entityType: "Game",
    entityId: gameId,
    oldValue: { operatorPrizeAmount: game.operatorPrizeAmount?.toString() ?? null },
    newValue: { operatorPrizeAmount: amount },
  });

  return updated;
}
