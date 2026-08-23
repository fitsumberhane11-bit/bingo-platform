/**
 * Shared financial/game ledger integrity checks — pure functions over a
 * PrismaClient, no console/process side effects. Used by both the
 * standalone CLI (scripts/integrity-check.ts, for ops/CI) and the
 * financial-integrity regression test (apps/web/lib/financial-integrity.test.ts,
 * which proves repeated test-suite execution cannot corrupt the shared dev
 * database — see docs/STATUS.md for the incident this guards against).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

const ZERO = new Prisma.Decimal(0);
const TOLERANCE = new Prisma.Decimal(0.01);

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export async function checkWalletReconstruction(prisma: PrismaClient): Promise<CheckResult[]> {
  const wallets = await prisma.wallet.findMany({ include: { user: { select: { username: true } } } });
  const results: CheckResult[] = [];
  for (const wallet of wallets) {
    const txs = await prisma.walletTransaction.findMany({ where: { userId: wallet.userId } });
    const expectedAvailable = txs.reduce((sum, t) => sum.plus(t.balanceAfter.minus(t.balanceBefore)), ZERO);

    const activeReservations = await prisma.walletTransaction.findMany({
      where: { userId: wallet.userId, type: "WITHDRAWAL", status: "PENDING" },
    });
    const expectedPending = activeReservations.reduce((sum, t) => sum.plus(t.amount), ZERO);

    const availableDiff = expectedAvailable.minus(wallet.availableBalance).abs();
    const pendingDiff = expectedPending.minus(wallet.pendingBalance).abs();
    results.push({
      name: `@${wallet.user.username} wallet reconciles`,
      passed: availableDiff.lte(TOLERANCE) && pendingDiff.lte(TOLERANCE),
      detail: `available: expected ${expectedAvailable} actual ${wallet.availableBalance} | pending: expected ${expectedPending} actual ${wallet.pendingBalance}`,
    });
  }
  return results;
}

export async function checkPlatformConservation(prisma: PrismaClient): Promise<CheckResult> {
  const [depositAgg, withdrawalAgg, adjustments, walletAgg, platformAccount] = await Promise.all([
    prisma.walletTransaction.aggregate({ where: { type: "DEPOSIT", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "WITHDRAWAL", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.walletTransaction.findMany({ where: { type: "ADJUSTMENT", status: "COMPLETED" }, select: { balanceBefore: true, balanceAfter: true } }),
    prisma.wallet.aggregate({ _sum: { availableBalance: true, pendingBalance: true } }),
    prisma.platformAccount.findUnique({ where: { singleton: 1 } }),
  ]);
  const netAdjustments = adjustments.reduce((sum, a) => sum.plus(a.balanceAfter.minus(a.balanceBefore)), ZERO);
  const expected = (depositAgg._sum.amount ?? ZERO).minus(withdrawalAgg._sum.amount ?? ZERO).plus(netAdjustments);
  const actual = (walletAgg._sum.availableBalance ?? ZERO).plus(walletAgg._sum.pendingBalance ?? ZERO).plus(platformAccount?.availableBalance ?? ZERO);
  const diff = expected.minus(actual).abs();
  return {
    name: "platform-wide conservation holds",
    passed: diff.lte(TOLERANCE),
    detail: `expected held ${expected}, actual held ${actual}, diff ${diff}`,
  };
}

export async function checkPayoutCompleteness(prisma: PrismaClient): Promise<CheckResult[]> {
  const winners = await prisma.winner.findMany({ select: { id: true, userId: true, prizeAmount: true, gameId: true } });
  const results: CheckResult[] = [];
  for (const w of winners) {
    const payoutTx = await prisma.walletTransaction.findMany({
      where: { userId: w.userId, relatedGameId: w.gameId, type: "WINNING_PAYOUT", status: "COMPLETED" },
    });
    const total = payoutTx.reduce((sum, t) => sum.plus(t.amount), ZERO);
    results.push({
      name: `winner ${w.id} paid exactly once, correct amount`,
      passed: payoutTx.length === 1 && total.minus(w.prizeAmount).abs().lte(TOLERANCE),
      detail: `${payoutTx.length} payout tx, total ${total}, expected ${w.prizeAmount}`,
    });
  }
  return results;
}

export async function checkNoOrphanedLedgerEntries(prisma: PrismaClient): Promise<CheckResult> {
  const entries = await prisma.platformLedgerEntry.findMany({ where: { relatedGameId: { not: null } }, select: { id: true, relatedGameId: true } });
  const gameIds = [...new Set(entries.map((e) => e.relatedGameId))] as string[];
  const existingGames = await prisma.game.findMany({ where: { id: { in: gameIds } }, select: { id: true } });
  const existingIds = new Set(existingGames.map((g) => g.id));
  const orphaned = entries.filter((e) => !existingIds.has(e.relatedGameId as string));
  return {
    name: "no platform ledger entries reference a deleted game",
    passed: orphaned.length === 0,
    detail: `${orphaned.length} orphaned of ${entries.length} total`,
  };
}

export async function checkReferenceIdUniqueness(prisma: PrismaClient): Promise<CheckResult> {
  const dupes = await prisma.$queryRaw<Array<{ referenceId: string; count: bigint }>>`
    SELECT "referenceId", COUNT(*) as count FROM "WalletTransaction" GROUP BY "referenceId" HAVING COUNT(*) > 1
  `;
  return {
    name: "no duplicate WalletTransaction referenceId",
    passed: dupes.length === 0,
    detail: `${dupes.length} duplicated reference IDs`,
  };
}

export async function runIntegrityChecks(prisma: PrismaClient): Promise<{ passed: boolean; results: CheckResult[] }> {
  const results: CheckResult[] = [
    ...(await checkWalletReconstruction(prisma)),
    await checkPlatformConservation(prisma),
    ...(await checkPayoutCompleteness(prisma)),
    await checkNoOrphanedLedgerEntries(prisma),
    await checkReferenceIdUniqueness(prisma),
  ];
  return { passed: results.every((r) => r.passed), results };
}
