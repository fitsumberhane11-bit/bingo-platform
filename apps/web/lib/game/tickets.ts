import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@bingo/db";
import { generateBingoCard, validateBingoCard } from "@bingo/game-core";
import { ConflictError, MaintenanceModeError, ValidationError } from "../errors";
import { withSerializableRetry } from "./serializable-retry";
import { getGameBroadcaster } from "./broadcaster";
import { notifyUser } from "../notifications";
import { applyPlatformLedgerEntryInTx } from "./platform-ledger";
import { isMaintenanceModeEnabled } from "../system-settings";
import { assertWithinSpendLimit } from "../responsible-gaming-service";

export class InsufficientTicketBalanceError extends ValidationError {
  constructor() {
    super("Insufficient wallet balance to purchase this many tickets.");
  }
}

/**
 * Atomically purchases 1..N tickets for a game:
 *
 *   verify eligibility (game open, registration window, capacity, per-player
 *   limit) -> verify wallet balance -> generate cards -> debit wallet
 *   (ledger row) -> create tickets -> upsert GamePlayer -> commit
 *
 * Runs inside a single Postgres SERIALIZABLE transaction (see
 * serializable-retry.ts) — this is what makes the capacity check race-safe:
 * two concurrent purchase requests that would both "see" one remaining
 * seat cannot both succeed. Postgres itself detects the conflict and one
 * transaction is retried from scratch against the now-current state.
 *
 * Deliberately does NOT call `applyWalletTransaction` (the Phase 3 wallet
 * service) directly — that function owns its own transaction/retry
 * boundary via optimistic locking, which is the right tool for
 * READ COMMITTED callers but can't be nested inside this SERIALIZABLE
 * transaction. The ledger *pattern* (immutable WalletTransaction row with
 * balanceBefore/After, updated inside the same transaction as the debit)
 * is preserved here; only the concurrency mechanism differs, because
 * Postgres SERIALIZABLE isolation already gives this transaction the
 * guarantee that optimistic locking exists to provide elsewhere.
 */
export async function purchaseTickets(input: { gameId: string; userId: string; ticketCount: number }) {
  if (input.ticketCount < 1) throw new ValidationError("Must purchase at least one ticket.");
  // New financial commitments are blocked during maintenance; games already
  // in progress are untouched (calling numbers, reconnecting, viewing
  // results are all pure reads/game-engine operations, not gated here).
  if (await isMaintenanceModeEnabled()) throw new MaintenanceModeError("Ticket purchases are paused during maintenance. Please try again shortly.");

  // Self-exclusion/cooling-off and self-imposed spending limits — checked
  // as a plain read outside the SERIALIZABLE transaction below (this
  // file's own convention: don't mix concurrency mechanisms inside that
  // transaction). ticketPrice never changes after a game is created, so
  // there's no race between this check and the actual debit.
  const priceCheck = await prisma.game.findUnique({ where: { id: input.gameId }, select: { ticketPrice: true } });
  if (priceCheck) {
    await assertWithinSpendLimit(input.userId, priceCheck.ticketPrice.mul(input.ticketCount));
  }

  return withSerializableRetry(async (tx) => {
    const game = await tx.game.findUnique({ where: { id: input.gameId } });
    if (!game) throw new ConflictError("Game not found.");

    const existingPlayer = await tx.gamePlayer.findUnique({
      where: { gameId_userId: { gameId: input.gameId, userId: input.userId } },
    });
    const isNewPlayer = !existingPlayer;

    if (game.status !== "OPEN" && !(game.status === "FULL" && existingPlayer)) {
      throw new ConflictError(
        game.status === "FULL"
          ? "This game has reached its player capacity."
          : `This game is not open for ticket purchases (status: ${game.status}).`,
      );
    }

    const now = new Date();
    if (now < game.registrationOpenAt) throw new ConflictError("Registration has not opened yet for this game.");
    if (now > game.registrationCloseAt) throw new ConflictError("Registration has closed for this game.");

    const currentTicketCount = existingPlayer?.ticketCount ?? 0;
    if (currentTicketCount + input.ticketCount > game.maxTicketsPerPlayer) {
      throw new ConflictError(`You may purchase at most ${game.maxTicketsPerPlayer} tickets for this game.`);
    }

    if (isNewPlayer) {
      const playerCount = await tx.gamePlayer.count({ where: { gameId: input.gameId } });
      if (playerCount >= game.maxPlayers) {
        throw new ConflictError("This game has reached its player capacity.");
      }
    }

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    const totalCost = game.ticketPrice.mul(input.ticketCount);
    if (wallet.availableBalance.lessThan(totalCost)) throw new InsufficientTicketBalanceError();

    const ticketCountSoFar = await tx.bingoTicket.count({ where: { gameId: input.gameId } });

    const tickets = [];
    for (let i = 0; i < input.ticketCount; i++) {
      const card = generateBingoCard();
      const validation = validateBingoCard(card);
      if (!validation.valid) {
        // Should be structurally impossible — defense in depth, never persist a malformed card.
        throw new Error(`Generated an invalid Bingo card: ${validation.errors.join(", ")}`);
      }
      const ticket = await tx.bingoTicket.create({
        data: {
          gameId: input.gameId,
          userId: input.userId,
          ticketNumber: ticketCountSoFar + i + 1,
          cardNumbers: card as unknown as Prisma.InputJsonValue,
          status: "ACTIVE",
          purchasePrice: game.ticketPrice,
        },
      });
      tickets.push(ticket);
    }

    const balanceBefore = wallet.availableBalance;
    const balanceAfter = balanceBefore.minus(totalCost);
    const referenceId = `ticket-purchase:${input.gameId}:${input.userId}:${randomUUID()}`;

    await tx.wallet.update({ where: { id: wallet.id }, data: { availableBalance: balanceAfter, version: { increment: 1 } } });
    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: input.userId,
        type: "TICKET_PURCHASE",
        status: "COMPLETED",
        amount: totalCost,
        balanceBefore,
        balanceAfter,
        referenceId,
        relatedGameId: input.gameId,
        metadata: { ticketIds: tickets.map((t) => t.id), ticketCount: input.ticketCount } as Prisma.InputJsonValue,
      },
    });

    await tx.bingoTicket.updateMany({
      where: { id: { in: tickets.map((t) => t.id) } },
      data: { purchaseTransactionId: walletTx.id },
    });

    // Split the ticket price between platform revenue and prize-pool
    // liability at the moment cash actually moves — see the PlatformAccount
    // schema comment. `platformFeePercent` is on PrizeRule directly (not
    // buried in `config`) so this split is well-defined for every
    // PrizeRuleType, including FIXED/JACKPOT rules whose payout amount
    // isn't itself proportional to sales.
    const prizeRule = await tx.prizeRule.findUniqueOrThrow({ where: { id: game.prizeRuleId } });
    const platformFeeContribution = totalCost.mul(prizeRule.platformFeePercent).dividedBy(100);
    const prizePoolContribution = totalCost.minus(platformFeeContribution);

    if (platformFeeContribution.greaterThan(0)) {
      await applyPlatformLedgerEntryInTx(tx, {
        type: "PLATFORM_FEE_REVENUE",
        amount: platformFeeContribution,
        referenceId: `platform-fee:${walletTx.id}`,
        relatedGameId: input.gameId,
        metadata: { ticketIds: tickets.map((t) => t.id) },
      });
    }
    if (prizePoolContribution.greaterThan(0)) {
      await applyPlatformLedgerEntryInTx(tx, {
        type: "PRIZE_POOL_CONTRIBUTION",
        amount: prizePoolContribution,
        referenceId: `prize-pool-contribution:${walletTx.id}`,
        relatedGameId: input.gameId,
        metadata: { ticketIds: tickets.map((t) => t.id) },
      });
    }

    const updatedPlayer = await tx.gamePlayer.upsert({
      where: { gameId_userId: { gameId: input.gameId, userId: input.userId } },
      create: { gameId: input.gameId, userId: input.userId, ticketCount: input.ticketCount },
      update: { ticketCount: { increment: input.ticketCount } },
    });

    let newPlayerCount: number | undefined;
    if (isNewPlayer) {
      newPlayerCount = await tx.gamePlayer.count({ where: { gameId: input.gameId } });
      if (newPlayerCount >= game.maxPlayers && game.status === "OPEN") {
        await tx.game.update({ where: { id: game.id }, data: { status: "FULL" } });
      }
    }

    await tx.gameEvent.create({
      data: {
        gameId: input.gameId,
        type: "TICKET_SOLD",
        payload: {
          userId: input.userId,
          ticketCount: input.ticketCount,
          ticketIds: tickets.map((t) => t.id),
          totalCost: totalCost.toString(),
        } as Prisma.InputJsonValue,
      },
    });

    return { tickets, wallet: { availableBalance: balanceAfter.toString() }, player: updatedPlayer, newPlayerCount, game };
  }).then(async (result) => {
    const broadcaster = getGameBroadcaster();
    broadcaster.publish(result.game.id, "game:ticket-purchased", {
      userId: input.userId,
      ticketCount: input.ticketCount,
    });
    if (result.newPlayerCount !== undefined) {
      broadcaster.publish(result.game.id, "game:player-count", { count: result.newPlayerCount, maxPlayers: result.game.maxPlayers });
    }
    await notifyUser({
      userId: input.userId,
      type: "TICKET_PURCHASED",
      title: "Ticket purchased",
      body: `You bought ${input.ticketCount} ticket(s) for ${result.game.name}. Good luck!`,
    });
    return result;
  });
}
