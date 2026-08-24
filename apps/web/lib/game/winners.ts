import { Prisma, prisma, type Game, type PrizeRule, type WinningPattern } from "@bingo/db";
import { evaluatePattern, resolveWinnerSet, splitByStake, splitEqually, type BingoCard, type PatternDefinition } from "@bingo/game-core";
import { payWinner } from "./payout";
import { writeAuditLog } from "../audit";
import { notifyUser } from "../notifications";
import { getGameBroadcaster } from "./broadcaster";

function toPatternDefinition(pattern: WinningPattern): PatternDefinition {
  return {
    matchType: pattern.matchType,
    matrix: (pattern.matrix as number[][] | null) ?? undefined,
    linesRequired: (pattern.config as { linesRequired?: number } | null)?.linesRequired,
  };
}

/**
 * Runs after every number call. Evaluates every ACTIVE ticket in the game
 * against the game's winning pattern; if one or more tickets complete it on
 * this exact call, records them all as simultaneous winners, splits the
 * prize pool per the configured tie-break rule, and credits each winner's
 * wallet. Idempotent per-ticket: `Winner.ticketId` is unique, so re-running
 * this for a call that was already processed (e.g. a retried request)
 * safely no-ops for tickets already recorded rather than double-paying.
 */
export async function detectAndRecordWinners(
  game: Game & { winningPattern: WinningPattern; prizeRule: PrizeRule },
  calledSet: ReadonlySet<number>,
  calledSequenceNumber: number,
  ballNumber: number,
): Promise<{ winnerCount: number }> {
  const patternDef = toPatternDefinition(game.winningPattern);

  const activeTickets = await prisma.bingoTicket.findMany({
    where: { gameId: game.id, status: "ACTIVE" },
    include: { user: { select: { username: true } } },
  });

  const candidates: { ticket: (typeof activeTickets)[number]; winningPositions: ReturnType<typeof evaluatePattern>["winningPositions"] }[] = [];
  for (const ticket of activeTickets) {
    const card = ticket.cardNumbers as unknown as BingoCard;
    const evaluation = evaluatePattern(card, calledSet, patternDef);
    if (evaluation.won) candidates.push({ ticket, winningPositions: evaluation.winningPositions });
  }

  if (candidates.length === 0) return { winnerCount: 0 };

  const resolvedTickets = resolveWinnerSet(
    candidates.map((c) => ({ ...c.ticket, _candidate: c })),
    game.prizeRule.tieBreakRule,
  );
  const resolvedCandidates = resolvedTickets.map((t) => (t as unknown as { _candidate: (typeof candidates)[number] })._candidate);

  const salesAgg = await prisma.bingoTicket.aggregate({ where: { gameId: game.id }, _sum: { purchasePrice: true } });
  const ticketSalesTotal = salesAgg._sum.purchasePrice ?? new Prisma.Decimal(0);

  const { calculatePrizePool } = await import("@bingo/game-core");
  const totalPrizePool = calculatePrizePool(
    game.prizeRule.config as { type: PrizeRule["type"]; winnerPercent?: number; fixedAmount?: number },
    ticketSalesTotal,
    game.jackpotAmount,
  );

  const shares =
    game.prizeRule.tieBreakRule === "SHARE_BY_STAKE"
      ? splitByStake(
          totalPrizePool,
          resolvedCandidates.map((c) => ({ purchasePrice: c.ticket.purchasePrice })),
        )
      : splitEqually(totalPrizePool, resolvedCandidates.length);

  let recorded = 0;
  for (let i = 0; i < resolvedCandidates.length; i++) {
    const candidate = resolvedCandidates[i]!;
    const prizeAmount = shares[i]!;

    // `justCreated` distinguishes "this call is the one that discovered the
    // win" from "a prior call (possibly one that then crashed) already
    // recorded it." Either way we still fall through to the payout step:
    // payWinner() is idempotent, so re-attempting it for an already-paid
    // winner is a safe no-op, while for a winner that was recorded but
    // never paid (the exact crash-recovery gap this guards against) it
    // completes the payout instead of leaving it stuck forever.
    let winner;
    let justCreated = true;
    try {
      winner = await prisma.winner.create({
        data: {
          gameId: game.id,
          ticketId: candidate.ticket.id,
          userId: candidate.ticket.userId,
          winningPatternId: game.winningPatternId,
          ballNumberAtWin: ballNumber,
          calledSequenceNumber,
          winningPositions: candidate.winningPositions as unknown as Prisma.InputJsonValue,
          prizeAmount,
          splitCount: resolvedCandidates.length,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        winner = await prisma.winner.findUniqueOrThrow({ where: { ticketId: candidate.ticket.id } });
        justCreated = false;
      } else {
        throw err;
      }
    }

    if (justCreated) {
      await prisma.bingoTicket.update({ where: { id: candidate.ticket.id }, data: { status: "WINNER" } });
    }

    const walletTx = await payWinner({
      userId: candidate.ticket.userId,
      amount: winner.prizeAmount,
      referenceId: `winner-payout:${winner.id}`,
      relatedGameId: game.id,
      relatedTicketId: candidate.ticket.id,
      relatedWinnerId: winner.id,
    });

    if (!winner.walletTransactionId) {
      await prisma.winner.update({ where: { id: winner.id }, data: { walletTransactionId: walletTx.id } });
    }

    if (!justCreated) continue; // already fully recorded, paid, audited, and announced by the run that first found it

    await writeAuditLog({
      actorUserId: candidate.ticket.userId,
      action: "WINNER_DECLARED",
      entityType: "Winner",
      entityId: winner.id,
      newValue: {
        gameId: game.id,
        ticketId: candidate.ticket.id,
        pattern: game.winningPattern.name,
        ballNumberAtWin: ballNumber,
        prizeAmount: prizeAmount.toString(),
      },
    });

    await prisma.gameEvent.create({
      data: {
        gameId: game.id,
        type: "WINNER_DECLARED",
        payload: {
          ticketId: candidate.ticket.id,
          userId: candidate.ticket.userId,
          prizeAmount: prizeAmount.toString(),
          ballNumberAtWin: ballNumber,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await notifyUser({
      userId: candidate.ticket.userId,
      type: "GAME_WINNER",
      title: "You won! 🎉",
      body: `Congratulations! Ticket #${candidate.ticket.ticketNumber} completed ${game.winningPattern.name} in ${game.name}. Prize: ETB ${prizeAmount.toString()}.`,
    });

    getGameBroadcaster().publish(game.id, "game:winner", {
      ticketId: candidate.ticket.id,
      userId: candidate.ticket.userId,
      username: candidate.ticket.user.username,
      ticketNumber: candidate.ticket.ticketNumber,
      prizeAmount: prizeAmount.toString(),
      winnerCount: resolvedCandidates.length,
      pattern: game.winningPattern.name,
    });

    recorded++;
  }

  await prisma.gameEvent.create({
    data: {
      gameId: game.id,
      type: "PRIZE_DISTRIBUTED",
      payload: {
        totalPrizePool: totalPrizePool.toString(),
        winnerCount: resolvedCandidates.length,
        tieBreakRule: game.prizeRule.tieBreakRule,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return { winnerCount: recorded };
}
