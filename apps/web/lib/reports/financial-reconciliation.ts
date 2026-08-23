import { Prisma, prisma } from "@bingo/db";

const ZERO = new Prisma.Decimal(0);

async function sumWalletTx(type: string, status: string) {
  const result = await prisma.walletTransaction.aggregate({ where: { type: type as never, status: status as never }, _sum: { amount: true } });
  return result._sum.amount ?? ZERO;
}

async function sumLedger(type: string) {
  const result = await prisma.platformLedgerEntry.aggregate({ where: { type: type as never }, _sum: { amount: true } });
  return result._sum.amount ?? ZERO;
}

/**
 * Manual admin balance adjustments (`WALLET_ADJUST`, see wallet-service.ts)
 * are a legitimate, audited third way money enters or leaves a wallet
 * outside the deposit/withdrawal flow — e.g. correcting a data error or
 * compensating a player off-system. They must be included in the money-
 * conservation identity or every adjustment ever made looks like a leak.
 * `amount` is always stored positive (direction is implicit in `type` for
 * most rows), so the true signed effect is read from balanceAfter−balanceBefore.
 */
async function sumSignedAdjustments() {
  const rows = await prisma.walletTransaction.findMany({
    where: { type: "ADJUSTMENT", status: "COMPLETED" },
    select: { balanceBefore: true, balanceAfter: true },
  });
  return rows.reduce((sum, r) => sum.plus(r.balanceAfter.minus(r.balanceBefore)), ZERO);
}

/**
 * Platform-wide financial overview. The headline figures are each reported
 * independently (not netted against each other) to match how Finance
 * actually wants to read them — "Refunds" and "Ticket Revenue" are both
 * useful on their own, not just as inputs to some other number.
 *
 * The one automated consistency check here is the real money-conservation
 * invariant, not a per-game recompute (that lives in game-financial-summary.ts,
 * where a single PrizeRule percentage actually applies): every ETB that ever
 * entered the platform via a completed deposit is, right now, sitting in
 * exactly one of three places — a player's wallet, the platform's custody
 * account, or it left via a completed withdrawal. If those don't sum to the
 * total deposited, something in the ledger chain is broken and Finance needs
 * to know immediately, not after a quarter-end audit.
 */
export async function getFinancialOverview() {
  const [
    totalDeposits,
    totalWithdrawalsCompleted,
    ticketRevenue,
    refunds,
    prizePoolContributions,
    prizePayouts,
    prizePoolForfeited,
    platformFeeRevenue,
    walletBalances,
    platformAccount,
    outstandingWithdrawals,
    netAdjustments,
  ] = await Promise.all([
    sumWalletTx("DEPOSIT", "COMPLETED"),
    sumWalletTx("WITHDRAWAL", "COMPLETED"),
    sumWalletTx("TICKET_PURCHASE", "COMPLETED"),
    sumWalletTx("REFUND", "COMPLETED"),
    sumLedger("PRIZE_POOL_CONTRIBUTION"),
    sumLedger("PRIZE_PAYOUT"),
    sumLedger("PRIZE_POOL_FORFEITED"),
    sumLedger("PLATFORM_FEE_REVENUE"),
    prisma.wallet.aggregate({ _sum: { availableBalance: true, pendingBalance: true } }),
    prisma.platformAccount.findUnique({ where: { singleton: 1 } }),
    prisma.withdrawal.aggregate({
      where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } },
      _sum: { amount: true },
    }),
    sumSignedAdjustments(),
  ]);

  const prizePoolLiability = prizePoolContributions.minus(prizePayouts).minus(prizePoolForfeited);
  const platformRevenue = platformFeeRevenue.plus(prizePoolForfeited);
  const platformAccountBalance = platformAccount?.availableBalance ?? ZERO;
  const sumAllWalletBalances = (walletBalances._sum.availableBalance ?? ZERO).plus(walletBalances._sum.pendingBalance ?? ZERO);
  const outstandingWithdrawalLiability = outstandingWithdrawals._sum.amount ?? ZERO;

  // Financial truth: deposits in, minus withdrawals out, plus/minus net
  // manual adjustments, must equal everything still held anywhere in the
  // system (player wallets + platform custody account).
  const expectedHeld = totalDeposits.minus(totalWithdrawalsCompleted).plus(netAdjustments);
  const actualHeld = sumAllWalletBalances.plus(platformAccountBalance);
  const delta = expectedHeld.minus(actualHeld);
  const reconciled = delta.abs().lessThanOrEqualTo(0.01); // penny-level rounding tolerance

  return {
    totalDeposits: totalDeposits.toString(),
    totalWithdrawals: totalWithdrawalsCompleted.toString(),
    ticketRevenue: ticketRevenue.toString(),
    prizePoolLiability: prizePoolLiability.toString(),
    prizePayouts: prizePayouts.toString(),
    platformRevenue: platformRevenue.toString(),
    refunds: refunds.toString(),
    outstandingWithdrawalLiability: outstandingWithdrawalLiability.toString(),
    consistencyCheck: {
      reconciled,
      expectedHeld: expectedHeld.toString(),
      actualHeld: actualHeld.toString(),
      delta: delta.toString(),
      formula: "Total Deposits − Total Withdrawals + Net Manual Adjustments = (Σ Player Wallet Balances) + Platform Account Balance",
      netAdjustments: netAdjustments.toString(),
    },
  };
}
