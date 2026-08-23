import { Prisma, prisma } from "@bingo/db";
import { NotFoundError } from "../errors";

const ZERO = new Prisma.Decimal(0);

/**
 * Per-game financial reconciliation. Unlike the platform-wide overview
 * (financial-reconciliation.ts), this can do a genuine "recompute from the
 * formula and compare to what was actually recorded" check, because a single
 * game has exactly one PrizeRule and therefore one well-defined platform-fee
 * percentage — the same percentage `tickets.ts` used at purchase time. If the
 * independently recomputed split doesn't match the ledger's recorded split,
 * that's a real bug, not rounding noise.
 */
export async function getGameFinancialSummary(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { prizeRule: true, winningPattern: true, createdBy: { select: { fullName: true, username: true } } },
  });
  if (!game) throw new NotFoundError("Game not found.");

  const [tickets, ledgerSums, winners, refundTx] = await Promise.all([
    prisma.bingoTicket.findMany({ where: { gameId }, select: { purchasePrice: true, status: true } }),
    prisma.platformLedgerEntry.groupBy({ by: ["type"], where: { relatedGameId: gameId }, _sum: { amount: true } }),
    prisma.winner.findMany({ where: { gameId }, select: { prizeAmount: true, userId: true, confirmedAt: true } }),
    prisma.walletTransaction.aggregate({ where: { relatedGameId: gameId, type: "REFUND", status: "COMPLETED" }, _sum: { amount: true } }),
  ]);

  const ledger = Object.fromEntries(ledgerSums.map((r) => [r.type, r._sum.amount ?? ZERO])) as Record<string, Prisma.Decimal>;
  const recordedContribution = ledger.PRIZE_POOL_CONTRIBUTION ?? ZERO;
  const recordedFeeRevenue = ledger.PLATFORM_FEE_REVENUE ?? ZERO;
  const prizePayout = ledger.PRIZE_PAYOUT ?? ZERO;
  const forfeited = ledger.PRIZE_POOL_FORFEITED ?? ZERO;
  const ledgerRefund = ledger.REFUND ?? ZERO;

  const ticketsSold = tickets.length;
  const ticketRevenue = tickets.reduce((sum, t) => sum.plus(t.purchasePrice), ZERO);
  const refunds = refundTx._sum.amount ?? ledgerRefund;

  // Independent recompute using the exact formula from tickets.ts, to prove
  // the recorded ledger split is what it should be, not just internally
  // self-consistent.
  const recomputedFee = ticketRevenue.mul(game.prizeRule.platformFeePercent).dividedBy(100);
  const recomputedContribution = ticketRevenue.minus(recomputedFee);

  const outstanding = recordedContribution.minus(prizePayout).minus(forfeited).minus(refunds);

  const feeMatches = recomputedFee.minus(recordedFeeRevenue).abs().lessThanOrEqualTo(0.01);
  const contributionMatches = recomputedContribution.minus(recordedContribution).abs().lessThanOrEqualTo(0.01);
  const isTerminal = game.status === "COMPLETED" || game.status === "CANCELLED";
  const outstandingOk = !isTerminal || outstanding.abs().lessThanOrEqualTo(0.01);

  const reconciled = feeMatches && contributionMatches && outstandingOk;

  return {
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      createdBy: game.createdBy,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      completedAt: game.completedAt,
      cancelledAt: game.cancelledAt,
      winningPattern: game.winningPattern.name,
      prizeRuleName: game.prizeRule.name,
      platformFeePercent: game.prizeRule.platformFeePercent.toString(),
    },
    ticketsSold,
    ticketRevenue: ticketRevenue.toString(),
    prizePool: recordedContribution.toString(),
    platformShare: recordedFeeRevenue.toString(),
    refunds: refunds.toString(),
    prizePaid: prizePayout.toString(),
    forfeited: forfeited.toString(),
    outstanding: outstanding.toString(),
    winners: winners.map((w) => ({ userId: w.userId, prizeAmount: w.prizeAmount.toString(), confirmedAt: w.confirmedAt })),
    consistencyCheck: {
      reconciled,
      feeMatches,
      contributionMatches,
      outstandingOk,
      recomputedFee: recomputedFee.toString(),
      recomputedContribution: recomputedContribution.toString(),
    },
    financialStatus: reconciled ? "RECONCILED" : "MISMATCH",
  };
}
