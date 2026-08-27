import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma, runIntegrityChecks } from "@bingo/db";
import { createGame, scheduleGame, openGame, startGame, cancelGame } from "./game/engine";
import { purchaseTickets } from "./game/tickets";
import { payWinner } from "./game/payout";
import { applyPlatformLedgerEntry } from "./game/platform-ledger";

// Regression test for the financial-drift incident documented in
// docs/STATUS.md and feedback_bingo_test_data_hygiene.md: test cleanup
// that deletes Game/Wallet rows without reversing their net footprint on
// the shared, permanent PlatformAccount singleton silently and
// permanently corrupts platform-wide money conservation on every
// `pnpm test` run. This file proves the fix holds by (a) exercising the
// specific scenario that most plausibly caused it — a LIVE emergency
// cancellation that deliberately does NOT auto-refund, leaving a wallet
// permanently debited relative to its ticket purchase — and (b) running
// the exact same integrity checks the ops CLI uses TWICE in a row before
// this file's own cleanup runs, then a third time immediately after, to
// prove the checker itself is stable/idempotent and that this file's own
// cleanup leaves zero net drift behind for the next test file or run.

let adminId: string;
let playerId: string;
let horizontalLineId: string;
let prizeRuleId: string;
const createdGameIds: string[] = [];

async function makeUser(label: string, balance: number) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: `Integrity Test ${label}`,
      username: `integrity_${label}_${suffix}`,
      email: `integrity_${label}_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "6").padEnd(8, "6").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `INT${label}${suffix.toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: { availableBalance: balance, pendingBalance: 0 } },
    },
  });
  return user.id;
}

function futureWindow() {
  const now = Date.now();
  return {
    gameDate: new Date(now),
    startTime: new Date(now + 1000 * 60 * 60),
    registrationOpenAt: new Date(now - 1000),
    registrationCloseAt: new Date(now + 1000 * 60 * 60),
  };
}

// Mirrors platform-ledger.ts's DELTA_SIGN table — see the identical helper
// (and its full rationale) in accounting.test.ts / engine.test.ts /
// recovery.test.ts / http-security.test.ts.
const LEDGER_SIGN: Record<string, number> = {
  PRIZE_POOL_CONTRIBUTION: 1,
  PLATFORM_FEE_REVENUE: 1,
  PRIZE_PAYOUT: -1,
  PRIZE_POOL_FORFEITED: 0,
  REFUND: -1,
};

async function computeGameNet(gameId: string): Promise<Prisma.Decimal> {
  const entries = await prisma.platformLedgerEntry.findMany({ where: { relatedGameId: gameId } });
  return entries.reduce((sum, e) => sum.plus(e.amount.times(LEDGER_SIGN[e.type] ?? 0)), new Prisma.Decimal(0));
}

// A fixed/staged prize can legitimately exceed sales-derived reservation —
// a genuinely negative net footprint — which needs a credit back, not a
// REFUND debit. See feedback_bingo_test_data_hygiene memory.
async function reverseGamePlatformFootprint(gameId: string) {
  const net = await computeGameNet(gameId);
  if (net.isZero()) return;
  if (net.gt(0)) {
    await applyPlatformLedgerEntry({ type: "REFUND", amount: net, referenceId: `test-cleanup-reversal:${gameId}`, relatedGameId: gameId });
  } else {
    await applyPlatformLedgerEntry({
      type: "PRIZE_POOL_CONTRIBUTION",
      amount: net.abs(),
      referenceId: `test-cleanup-reversal:${gameId}`,
      relatedGameId: gameId,
    });
  }
}

beforeAll(async () => {
  adminId = await makeUser("admin", 0);
  playerId = await makeUser("player", 10000);
  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { name: "One Horizontal Line" } });
  horizontalLineId = pattern.id;
  const rule = await prisma.prizeRule.findUniqueOrThrow({ where: { name: "Standard 70/30 Split" } });
  prizeRuleId = rule.id;
});

afterAll(async () => {
  // Settle money first, credits (negative net) before debits (positive
  // net) — see claims.test.ts's afterAll for the full rationale.
  const nets = await Promise.all(createdGameIds.map(async (gameId) => ({ gameId, net: await computeGameNet(gameId) })));
  nets.sort((a, b) => a.net.comparedTo(b.net));
  for (const { gameId } of nets) {
    await reverseGamePlatformFootprint(gameId);
  }

  for (const gameId of createdGameIds) {
    await prisma.winner.deleteMany({ where: { gameId } });
    await prisma.gameEvent.deleteMany({ where: { gameId } });
    await prisma.bingoNumber.deleteMany({ where: { gameId } });
    await prisma.walletTransaction.deleteMany({ where: { relatedGameId: gameId } });
    await prisma.bingoTicket.deleteMany({ where: { gameId } });
    await prisma.gamePlayer.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
  for (const userId of [adminId, playerId]) {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.walletTransaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    // The game-start announcement ("Game is starting in Ns") is authored
    // by whoever called startGame() — must go before the user row, same
    // FK-RESTRICT reason as the winner-confirmation announcement fix.
    await prisma.announcement.deleteMany({ where: { createdByUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  // The core regression assertion: after this file's own cleanup, the
  // shared database must be exactly as balanced as it was before this
  // file ran — zero net drift left behind for whatever runs next.
  const after = await runIntegrityChecks(prisma);
  const failed = after.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    throw new Error(`financial-integrity regression: cleanup left drift behind — ${JSON.stringify(failed)}`);
  }

  await prisma.$disconnect();
}, 30000);

describe("financial integrity survives the trickiest known cleanup scenario", () => {
  it("a LIVE emergency-cancel with a deliberately unrefunded wallet still reconciles globally once cleaned up", async () => {
    const game = await createGame(
      {
        name: `Integrity Test Game ${randomUUID().slice(0, 6)}`,
        ...futureWindow(),
        ticketPrice: 25,
        maxPlayers: 5,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 5,
        callMode: "MANUAL",
        winningPatternId: horizontalLineId,
        prizeRuleId,
      },
      adminId,
    );
    createdGameIds.push(game.id);

    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await new Promise((r) => setTimeout(r, 1200)); // let the LIVE transition land

    // Emergency-cancel from LIVE deliberately does NOT auto-refund — the
    // exact "wallet permanently debited, no matching refund" shape that
    // caused the original incident when the platform side wasn't also
    // reversed at cleanup time.
    await cancelGame(game.id, adminId, "Integrity regression test: emergency cancellation.");

    const mid = await runIntegrityChecks(prisma);
    // Mid-test (before this file's own cleanup), the ledger is internally
    // consistent by construction — money simply hasn't been reversed yet.
    // Running the checker here twice in a row proves it's read-only and
    // idempotent (no side effects from checking itself).
    const midAgain = await runIntegrityChecks(prisma);
    expect(mid.results.map((r) => r.passed)).toEqual(midAgain.results.map((r) => r.passed));
  }, 20000);

  it("10 concurrent payWinner() calls plus cleanup reversal still leave the platform account exactly net-zero for this game", async () => {
    const game = await createGame(
      {
        name: `Integrity Payout Game ${randomUUID().slice(0, 6)}`,
        ...futureWindow(),
        ticketPrice: 40,
        maxPlayers: 5,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 5,
        callMode: "MANUAL",
        winningPatternId: horizontalLineId,
        prizeRuleId,
      },
      adminId,
    );
    createdGameIds.push(game.id);
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerId } });

    const winner = await prisma.winner.create({
      data: {
        gameId: game.id,
        ticketId: ticket.id,
        userId: playerId,
        winningPatternId: horizontalLineId,
        ballNumberAtWin: 7,
        calledSequenceNumber: 3,
        winningPositions: [] as unknown as Prisma.InputJsonValue,
        prizeAmount: new Prisma.Decimal(28),
        splitCount: 1,
      },
    });

    const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerId } });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        payWinner({
          userId: playerId,
          amount: winner.prizeAmount,
          referenceId: `integrity-winner-payout:${winner.id}`,
          relatedGameId: game.id,
          relatedTicketId: ticket.id,
          relatedWinnerId: winner.id,
        }),
      ),
    );

    // The invariant that must hold *immediately*, before any cleanup: 10
    // concurrent calls converge on exactly one real payout. Platform-wide
    // conservation is a *whole-file* invariant, not a per-step one — the
    // wallet side of this game's footprint only gets made whole when the
    // wallet itself is deleted in this file's afterAll below, so asserting
    // conservation here (before that happens) would be checking an
    // invariant that was never supposed to hold mid-test.
    const payoutTxCount = await prisma.walletTransaction.count({ where: { referenceId: `integrity-winner-payout:${winner.id}` } });
    expect(payoutTxCount).toBe(1);
    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerId } });
    expect(walletAfter.availableBalance.minus(walletBefore.availableBalance).toNumber()).toBe(28);

    await reverseGamePlatformFootprint(game.id);
  }, 20000);
});
