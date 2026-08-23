import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@bingo/db";
import { createGame, scheduleGame, openGame, startGame, ensureAutoCallerRunning, stopAutoCaller } from "./engine";
import { purchaseTickets } from "./tickets";
import { getGameSnapshot } from "./snapshot";
import { applyPlatformLedgerEntry } from "./platform-ledger";

// Integration tests — require a real Postgres reachable via DATABASE_URL.
//
// Simulates "the realtime process crashes and restarts" (Priority 9,
// scenario A) by directly clearing the in-memory timer maps the auto-caller
// lives in — exactly what a real process restart does, since those maps
// are plain in-memory state with no persistence. Everything that's
// SUPPOSED to survive a restart (status, calledCount, called numbers) is
// verified by reading straight from Postgres; the one thing that doesn't
// automatically survive (the AUTO-mode timer) is verified to self-heal via
// `ensureAutoCallerRunning()`, the same call the SSE stream route makes on
// every reconnect.

let adminId: string;
let playerId: string;
let horizontalLineId: string;
let prizeRuleId: string;
const createdGameIds: string[] = [];

function clearAllInMemoryGameTimers() {
  const g = globalThis as unknown as Record<string, Map<string, NodeJS.Timeout> | undefined>;
  for (const key of ["__gameAutoCallTimers", "__gameCountdownTimers"]) {
    const map = g[key];
    if (map) {
      for (const timer of map.values()) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      map.clear();
    }
  }
}

async function makeUser(label: string, balance: number) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: `Recovery Test ${label}`,
      username: `recovery_${label}_${suffix}`,
      email: `recovery_${label}_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "5").padEnd(8, "5").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `REC${label}${suffix.toUpperCase()}`,
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

/**
 * Reverses this game's entire net contribution to the shared, permanent
 * PlatformAccount before its owning users get hard-deleted below. Any
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
  playerId = await makeUser("player", 10000);
  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { name: "One Horizontal Line" } });
  horizontalLineId = pattern.id;
  const rule = await prisma.prizeRule.findUniqueOrThrow({ where: { name: "Standard 70/30 Split" } });
  prizeRuleId = rule.id;
});

afterAll(async () => {
  for (const gameId of createdGameIds) {
    stopAutoCaller(gameId);
    await reverseGamePlatformFootprint(gameId);
    await prisma.winner.deleteMany({ where: { gameId } });
    await prisma.gameEvent.deleteMany({ where: { gameId } });
    await prisma.bingoNumber.deleteMany({ where: { gameId } });
    // Deliberately NOT deleting PlatformLedgerEntry rows — see the matching
    // comment in accounting.test.ts's afterAll for why (shared singleton
    // PlatformAccount, deleting entries without reversing the balance they
    // represent causes permanent drift).
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

describe("recovery: realtime process restart", () => {
  it("game state (status, calledCount, called numbers) survives a lost in-memory timer, and the AUTO caller self-heals on reconnect", async () => {
    const game = await createGame(
      {
        name: `Recovery Test Game ${randomUUID().slice(0, 6)}`,
        ...futureWindow(),
        ticketPrice: 10,
        maxPlayers: 5,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 3,
        callMode: "AUTO",
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

    await vi.waitFor(
      async () => {
        const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
        expect(g.status).toBe("LIVE");
        expect(g.calledCount).toBeGreaterThanOrEqual(1); // AUTO caller has run at least once
      },
      { timeout: 15000, interval: 200 },
    );

    const beforeRestart = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    const calledNumbersBeforeRestart = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });

    // --- Simulate the realtime process crashing and restarting ---
    clearAllInMemoryGameTimers();

    // Everything that must survive a restart is read straight from
    // Postgres, with zero dependency on the timers that just got wiped.
    const afterRestart = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(afterRestart.status).toBe("LIVE");
    expect(afterRestart.calledCount).toBe(beforeRestart.calledCount);
    const calledNumbersAfterRestart = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
    expect(calledNumbersAfterRestart).toEqual(calledNumbersBeforeRestart);
    expect(new Set(calledNumbersAfterRestart.map((n) => n.ballNumber)).size).toBe(calledNumbersAfterRestart.length); // no duplicates

    // Confirm the caller genuinely stopped — no timer means no progress.
    await new Promise((r) => setTimeout(r, 4000));
    const stillStalled = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(stillStalled.calledCount).toBe(afterRestart.calledCount);

    // This is what the SSE stream route does on every connect/reconnect —
    // a player reconnecting (or simply loading the room) after the crash
    // self-heals the AUTO caller with no separate admin action required.
    const snapshot = await getGameSnapshot(game.id, playerId);
    expect(snapshot).not.toBeNull();
    ensureAutoCallerRunning(game.id, snapshot!.game.status, snapshot!.game.callMode);

    await vi.waitFor(
      async () => {
        const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
        expect(g.calledCount).toBeGreaterThan(afterRestart.calledCount);
      },
      { timeout: 10000, interval: 200 },
    );
  }, 30000);

  it("game:sync snapshot alone contains everything a reconnecting client needs — no reliance on retained browser state", async () => {
    const game = await createGame(
      {
        name: `Recovery Snapshot Test ${randomUUID().slice(0, 6)}`,
        ...futureWindow(),
        ticketPrice: 10,
        maxPlayers: 5,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 3,
        callMode: "MANUAL",
        winningPatternId: horizontalLineId,
        prizeRuleId,
      },
      adminId,
    );
    createdGameIds.push(game.id);

    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    const { tickets } = await purchaseTickets({ gameId: game.id, userId: playerId, ticketCount: 2 });

    const snapshot = await getGameSnapshot(game.id, playerId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.game.status).toBe("OPEN");
    expect(snapshot!.playerTickets.map((t) => t.id).sort()).toEqual(tickets.map((t) => t.id).sort());
    expect(snapshot!.playerCount).toBe(1);
    expect(snapshot!.ticketCount).toBe(2);
    expect(snapshot!.serverTimestamp).toBeTruthy(); // server-authoritative time, not the client's clock
    expect(typeof snapshot!.prizePool).toBe("string");
    expect(Array.isArray(snapshot!.announcements)).toBe(true);
    expect(Array.isArray(snapshot!.winners)).toBe(true);
    expect(Array.isArray(snapshot!.calledNumbers)).toBe(true);
  });
});
