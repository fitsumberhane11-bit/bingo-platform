import { Prisma, prisma } from "@bingo/db";
import { resolveGamePrizePool } from "./prize-authority";

/**
 * The single canonical view of a game's current state. Used for BOTH the
 * initial page load and the SSE `game:sync` event a reconnecting client
 * receives — so the UI never has two independently-maintained ideas of
 * what "current state" means (see docs/ARCHITECTURE.md §9). Never includes
 * the secret seed or any not-yet-called ball: `calledNumbers` is read
 * straight from the `BingoNumber` table, which by construction only ever
 * contains numbers that have actually been called.
 */
export async function getGameSnapshot(gameId: string, userId?: string | null) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      winningPattern: { select: { id: true, name: true, description: true } },
      prizeRule: { select: { id: true, name: true, type: true, config: true, tieBreakRule: true, platformFeePercent: true } },
      calledNumbers: { orderBy: { sequenceNumber: "asc" } },
      _count: { select: { players: true, tickets: true } },
    },
  });
  if (!game) return null;

  const prizePool = await resolveGamePrizePool(game, game.prizeRule);
  const salesAgg = await prisma.bingoTicket.aggregate({ where: { gameId }, _sum: { purchasePrice: true } });
  const ticketSalesTotal = salesAgg._sum.purchasePrice ?? new Prisma.Decimal(0);

  const winningStages = await prisma.winningStage.findMany({
    where: { gameId },
    include: { pattern: { select: { name: true } } },
    orderBy: { order: "asc" },
  });

  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      active: true,
      // Two independent OR conditions ANDed together (not-expired) AND (targeted at this viewer):
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ targetType: "ALL" }, { targetType: "GAME", gameId }, { targetType: "USER", targetUserId: userId ?? "__none__" }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, message: true, targetType: true, createdAt: true, expiresAt: true },
  });

  const disqualifiedCardCount = await prisma.bingoTicket.count({ where: { gameId, status: "DISQUALIFIED" } });

  // A currently-PENDING claim's card, so every player in the room — not
  // just the claimant — can visually cross-check it against the called
  // numbers while the operator reviews it (transparency: the same reason
  // resolveWinnerSet's outcome is never taken on faith either). Included in
  // the snapshot (not just the live "game:claim" broadcast) so a client
  // reconnecting mid-review still sees it instead of missing the window.
  const pendingVerificationClaim = await prisma.bingoClaim.findFirst({
    where: { gameId, validationStatus: "VALID", confirmationStatus: "PENDING" },
    include: { ticket: { select: { ticketNumber: true, cardNumbers: true } }, user: { select: { username: true } }, pattern: { select: { name: true } } },
    orderBy: { submittedAt: "desc" },
  });

  const winners = await prisma.winner.findMany({
    where: { gameId },
    include: { user: { select: { username: true } }, ticket: { select: { ticketNumber: true, cardNumbers: true } } },
    orderBy: { confirmedAt: "asc" },
  });

  const calledNumbers = game.calledNumbers.map((n) => ({ ballNumber: n.ballNumber, letter: n.letter, sequenceNumber: n.sequenceNumber }));
  const currentNumber = calledNumbers.at(-1) ?? null;

  let playerTickets: Awaited<ReturnType<typeof prisma.bingoTicket.findMany>> = [];
  let myPendingClaims: { ticketId: string; stageId: string | null }[] = [];
  if (userId) {
    playerTickets = await prisma.bingoTicket.findMany({ where: { gameId, userId }, orderBy: { ticketNumber: "asc" } });
    const pending = await prisma.bingoClaim.findMany({
      where: { gameId, userId, confirmationStatus: "PENDING" },
      select: { ticketId: true, stageId: true },
    });
    myPendingClaims = pending;
  }

  return {
    serverTimestamp: now.toISOString(),
    game: {
      id: game.id,
      name: game.name,
      gameCode: game.gameCode,
      description: game.description,
      status: game.status,
      startTime: game.startTime,
      registrationOpenAt: game.registrationOpenAt,
      registrationCloseAt: game.registrationCloseAt,
      ticketPrice: game.ticketPrice.toString(),
      maxPlayers: game.maxPlayers,
      maxTicketsPerPlayer: game.maxTicketsPerPlayer,
      minPlayers: game.minPlayers,
      jackpotAmount: game.jackpotAmount.toString(),
      callMode: game.callMode,
      callIntervalSeconds: game.callIntervalSeconds,
      manualMarkEnabled: game.manualMarkEnabled,
      seedCommitmentHash: game.seedCommitmentHash,
      seedRevealed: !!game.seedRevealedAt,
      startedAt: game.startedAt,
      pausedAt: game.pausedAt,
      completedAt: game.completedAt,
      cancelledAt: game.cancelledAt,
      winningPattern: game.winningPattern,
    },
    currentNumber,
    calledNumbers,
    calledCount: game.calledCount,
    remainingCount: 75 - game.calledCount,
    playerCount: game._count.players,
    ticketCount: game._count.tickets,
    disqualifiedCardCount,
    ticketSalesTotal: ticketSalesTotal.toString(),
    prizePool: prizePool.toString(),
    winningStages: winningStages.map((s) => ({
      id: s.id,
      order: s.order,
      label: s.label ?? s.pattern.name,
      patternName: s.pattern.name,
      prizeAmount: s.prizeAmount.toString(),
      winnerLimit: s.winnerLimit,
      winnerCount: s.winnerCount,
      status: s.status,
    })),
    announcements: announcements.map((a) => ({ id: a.id, type: a.type, message: a.message, createdAt: a.createdAt, expiresAt: a.expiresAt })),
    pendingVerification: pendingVerificationClaim
      ? {
          ticketId: pendingVerificationClaim.ticketId,
          ticketNumber: pendingVerificationClaim.ticket.ticketNumber,
          username: pendingVerificationClaim.user.username,
          pattern: pendingVerificationClaim.pattern.name,
          cardNumbers: pendingVerificationClaim.ticket.cardNumbers,
        }
      : null,
    winners: winners.map((w) => ({
      ticketId: w.ticketId,
      ticketNumber: w.ticket.ticketNumber,
      cardNumbers: w.ticket.cardNumbers,
      username: w.user.username,
      prizeAmount: w.prizeAmount.toString(),
      ballNumberAtWin: w.ballNumberAtWin,
      isMine: userId ? w.userId === userId : false,
    })),
    playerTickets: playerTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      cardNumbers: t.cardNumbers,
      status: t.status,
      disqualifiedReason: t.disqualifiedReason,
      hasPendingClaim: myPendingClaims.some((c) => c.ticketId === t.id),
    })),
  };
}

export type GameSnapshot = NonNullable<Awaited<ReturnType<typeof getGameSnapshot>>>;
