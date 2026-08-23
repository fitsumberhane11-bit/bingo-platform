import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@bingo/db";
import { createGame } from "./engine";
import { purchaseTickets } from "./tickets";
import { payWinner } from "./payout";
import { applyPlatformLedgerEntry } from "./platform-ledger";

// Integration tests — require a real Postgres reachable via DATABASE_URL.

let adminId: string;
let playerId: string;
let horizontalLineId: string;
let prizeRuleId: string;
const createdGameIds: string[] = [];

async function makeUser(label: string, balance: number) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: `Accounting Test ${label}`,
      username: `acct_${label}_${suffix}`,
      email: `acct_${label}_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "3").padEnd(8, "3").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `ACT${label}${suffix.toUpperCase()}`,
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

async function makeGame(ticketPrice: number) {
  const game = await createGame(
    {
      name: `Accounting Test Game ${randomUUID().slice(0, 6)}`,
      ...futureWindow(),
      ticketPrice,
      maxPlayers: 10,
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
  return game;
}

/**
 * Reverses this game's entire net contribution to the shared, permanent
 * PlatformAccount before afterAll hard-deletes its owning users below. Any
 * money a ticket purchase, fee, or payout moved onto that persistent
 * singleton traces back to one of these tests' synthetic wallet balances
 * (created directly with a starting balance, never a real DEPOSIT
 * transaction) — once the wallet is gone, nothing backs that money
 * anymore, and the platform-wide conservation check (Total Deposits −
 * Total Withdrawals + Adjustments == ΣWallet Balances + PlatformAccount
 * Balance) drifts by exactly that amount forever. Reversing the game's
 * *net* footprint in one shot — rather than refunding ticket-by-ticket —
 * works uniformly no matter what happened to the game (still open,
 * cancelled, or fully completed with a real winner paid out), since it
 * only cares about the final signed total this game left on the account,
 * not how it got there. Self-idempotent: the reversal entry is itself
 * tagged with this game's id, so summing again nets to zero and nothing
 * further is written.
 */
async function reverseGamePlatformFootprint(gameId: string) {
  const entries = await prisma.platformLedgerEntry.findMany({ where: { relatedGameId: gameId } });
  if (entries.length === 0) return;

  // Mirrors platform-ledger.ts's DELTA_SIGN table — keep in sync if that changes.
  const sign: Record<string, number> = {
    PRIZE_POOL_CONTRIBUTION: 1,
    PLATFORM_FEE_REVENUE: 1,
    PRIZE_PAYOUT: -1,
    PRIZE_POOL_FORFEITED: 0,
    REFUND: -1,
  };
  const net = entries.reduce((sum, e) => sum.plus(e.amount.times(sign[e.type] ?? 0)), new Prisma.Decimal(0));
  if (net.lte(0)) return; // nothing left on the account to reverse

  await applyPlatformLedgerEntry({
    type: "REFUND",
    amount: net,
    referenceId: `test-cleanup-reversal:${gameId}`,
    relatedGameId: gameId,
  });
}

beforeAll(async () => {
  adminId = await makeUser("admin", 0);
  playerId = await makeUser("player", 100000);
  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { name: "One Horizontal Line" } });
  horizontalLineId = pattern.id;
  const rule = await prisma.prizeRule.findUniqueOrThrow({ where: { name: "Standard 70/30 Split" } }); // winnerPercent 70 / platformFeePercent 30
  prizeRuleId = rule.id;
});

afterAll(async () => {
  for (const gameId of createdGameIds) {
    await reverseGamePlatformFootprint(gameId);
    await prisma.winner.deleteMany({ where: { gameId } });
    await prisma.gameEvent.deleteMany({ where: { gameId } });
    // Deliberately NOT deleting PlatformLedgerEntry rows: the singleton
    // PlatformAccount they're booked against persists across test runs, so
    // deleting the entries without reversing the balance they represent
    // silently drifts the account forever — this exact bug was found live
    // via the Phase 9 integrity-check script (see docs/STATUS.md) after
    // ~2300 untracked version increments accumulated on the shared account.
    await prisma.walletTransaction.deleteMany({ where: { relatedGameId: gameId } });
    await prisma.bingoTicket.deleteMany({ where: { gameId } });
    await prisma.gamePlayer.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
  for (const userId of [adminId, playerId]) {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.walletTransaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe("ticket purchase splits revenue between platform fee and prize-pool liability", () => {
  it("records PLATFORM_FEE_REVENUE + PRIZE_POOL_CONTRIBUTION that sum exactly to the ticket price", async () => {
    const game = await makeGame(100);
    await prisma.game.update({ where: { id: game.id }, data: { status: "OPEN" } });

    // Asserts only on entries scoped to this test's own game — NOT on the
    // shared PlatformAccount's overall balance, which other test files
    // (e.g. engine.test.ts) may be concurrently mutating via their own
    // ticket purchases when vitest runs files in parallel.
    const result = await purchaseTickets({ gameId: game.id, userId: playerId, ticketCount: 2 });

    const entries = await prisma.platformLedgerEntry.findMany({ where: { relatedGameId: game.id } });
    const fee = entries.find((e) => e.type === "PLATFORM_FEE_REVENUE")!;
    const pool = entries.find((e) => e.type === "PRIZE_POOL_CONTRIBUTION")!;

    expect(fee.amount.toNumber()).toBe(60); // 200 total * 30%
    expect(pool.amount.toNumber()).toBe(140); // 200 total * 70%
    expect(fee.amount.plus(pool.amount).toNumber()).toBe(200);
    expect(fee.balanceAfter.minus(fee.balanceBefore).toNumber()).toBe(60); // this entry's own before/after, not the account's overall trajectory
    expect(pool.balanceAfter.minus(pool.balanceBefore).toNumber()).toBe(140);
    expect(result.tickets).toHaveLength(2);
  });
});

describe("winner payout idempotency under concurrency", () => {
  it("10 concurrent payWinner() calls for the same winner produce exactly one real payout", async () => {
    const game = await makeGame(50);
    await prisma.game.update({ where: { id: game.id }, data: { status: "OPEN" } });
    await purchaseTickets({ gameId: game.id, userId: playerId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerId } });

    const winner = await prisma.winner.create({
      data: {
        gameId: game.id,
        ticketId: ticket.id,
        userId: playerId,
        winningPatternId: horizontalLineId,
        ballNumberAtWin: 42,
        calledSequenceNumber: 10,
        winningPositions: [] as unknown as Prisma.InputJsonValue,
        prizeAmount: new Prisma.Decimal(35),
        splitCount: 1,
      },
    });

    const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerId } });

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        payWinner({
          userId: playerId,
          amount: winner.prizeAmount,
          referenceId: `winner-payout:${winner.id}`,
          relatedGameId: game.id,
          relatedTicketId: ticket.id,
          relatedWinnerId: winner.id,
        }),
      ),
    );

    const uniqueTransactionIds = new Set(attempts.map((a) => a.id));
    expect(uniqueTransactionIds.size).toBe(1); // all 10 calls converged on the same WalletTransaction row

    const walletTxCount = await prisma.walletTransaction.count({ where: { referenceId: `winner-payout:${winner.id}` } });
    expect(walletTxCount).toBe(1);
    const platformEntry = await prisma.platformLedgerEntry.findUnique({ where: { referenceId: `platform:winner-payout:${winner.id}` } });
    expect(platformEntry).not.toBeNull();
    expect(platformEntry!.amount.toNumber()).toBe(35);
    expect(platformEntry!.balanceBefore.minus(platformEntry!.balanceAfter).toNumber()).toBe(35); // this entry's own delta — a debit

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerId } });
    expect(walletAfter.availableBalance.minus(walletBefore.availableBalance).toNumber()).toBe(35);
  });

  it("retrying payWinner() for an already-recorded-but-crashed winner still pays exactly once", async () => {
    // Simulates the exact crash-recovery gap the fix closes: a Winner row exists
    // (a prior run got that far) but was never paid because the process died
    // before the payout step. Calling payWinner() directly — as
    // detectAndRecordWinners() now does unconditionally, even for a
    // pre-existing winner — must still complete the payout, exactly once.
    const game = await makeGame(20);
    await prisma.game.update({ where: { id: game.id }, data: { status: "OPEN" } });
    await purchaseTickets({ gameId: game.id, userId: playerId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerId } });

    const winner = await prisma.winner.create({
      data: {
        gameId: game.id,
        ticketId: ticket.id,
        userId: playerId,
        winningPatternId: horizontalLineId,
        ballNumberAtWin: 10,
        calledSequenceNumber: 5,
        winningPositions: [] as unknown as Prisma.InputJsonValue,
        prizeAmount: new Prisma.Decimal(14),
        splitCount: 1,
      },
    });
    expect(winner.walletTransactionId).toBeNull(); // exactly the "recorded but unpaid" state

    const payoutInput = {
      userId: playerId,
      amount: winner.prizeAmount,
      referenceId: `winner-payout:${winner.id}`,
      relatedGameId: game.id,
      relatedTicketId: ticket.id,
      relatedWinnerId: winner.id,
    };

    const first = await payWinner(payoutInput);
    const second = await payWinner(payoutInput); // simulates a retried "repair" call
    expect(first.id).toBe(second.id);

    const count = await prisma.walletTransaction.count({ where: { referenceId: payoutInput.referenceId } });
    expect(count).toBe(1);
  });
});
