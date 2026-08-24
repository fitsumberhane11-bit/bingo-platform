import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@bingo/db";
import { deriveCallSequence, type BingoCard } from "@bingo/game-core";
import { decryptSecret } from "../crypto";
import {
  callNextNumber,
  cancelGame,
  completeGame,
  createGame,
  openGame,
  pauseGame,
  resumeGame,
  scheduleGame,
  startGame,
  stopAutoCaller,
} from "./engine";
import { purchaseTickets } from "./tickets";
import { applyPlatformLedgerEntry } from "./platform-ledger";
import { getGameBroadcaster } from "./broadcaster";

// Integration tests — require a real Postgres reachable via DATABASE_URL.

let adminId: string;
let playerAId: string;
let playerBId: string;
let horizontalLineId: string;
let prizeRuleId: string;
const createdGameIds: string[] = [];

async function makeUser(label: string, balance: number) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: `Engine Test ${label}`,
      username: `engine_${label}_${suffix}`,
      email: `engine_${label}_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "2").padEnd(8, "2").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `ENG${label}${suffix.toUpperCase()}`,
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
    registrationOpenAt: new Date(now - 1000), // already open
    registrationCloseAt: new Date(now + 1000 * 60 * 60),
  };
}

async function makeGame(overrides: Partial<Parameters<typeof createGame>[0]> = {}) {
  const game = await createGame(
    {
      name: `Test Game ${randomUUID().slice(0, 6)}`,
      ...futureWindow(),
      ticketPrice: 10,
      maxPlayers: overrides.maxPlayers ?? 10,
      maxTicketsPerPlayer: 5,
      minPlayers: 1,
      callIntervalSeconds: 5,
      callMode: "MANUAL",
      winningPatternId: horizontalLineId,
      prizeRuleId,
      ...overrides,
    },
    adminId,
  );
  createdGameIds.push(game.id);
  return game;
}

async function craftWinningCard(seed: string, calledSoFarCount: number): Promise<{ card: BingoCard; callsNeeded: number }> {
  const sequence = deriveCallSequence(seed);
  const ranges: Record<string, [number, number]> = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };
  const targets: Record<string, number> = {};
  const firstIndex: Record<string, number> = {};

  for (let i = 0; i < sequence.length; i++) {
    const ball = sequence[i]!;
    for (const [letter, [min, max]] of Object.entries(ranges)) {
      if (targets[letter] === undefined && ball >= min && ball <= max) {
        targets[letter] = ball;
        firstIndex[letter] = i;
      }
    }
    if (Object.keys(targets).length === 5) break;
  }

  function columnValues(letter: "B" | "I" | "N" | "G" | "O", excludeCount: number): number[] {
    const [min, max] = ranges[letter]!;
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i).filter((n) => n !== targets[letter]);
    return [targets[letter]!, ...pool.slice(0, excludeCount)];
  }

  const card: BingoCard = {
    B: columnValues("B", 4),
    I: columnValues("I", 4),
    N: [targets.N!, columnValues("N", 4)[1]!, null, columnValues("N", 4)[2]!, columnValues("N", 4)[3]!],
    G: columnValues("G", 4),
    O: columnValues("O", 4),
  };

  const callsNeeded = Math.max(...Object.values(firstIndex)) + 1;
  return { card, callsNeeded: Math.max(callsNeeded, calledSoFarCount) };
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
  playerAId = await makeUser("playerA", 10000);
  playerBId = await makeUser("playerB", 10000);

  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { name: "One Horizontal Line" } });
  horizontalLineId = pattern.id;
  const rule = await prisma.prizeRule.findUniqueOrThrow({ where: { name: "Standard 70/30 Split" } });
  prizeRuleId = rule.id;
});

afterEach(() => {
  for (const id of createdGameIds) stopAutoCaller(id);
});

afterAll(async () => {
  for (const gameId of createdGameIds) {
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
  for (const userId of [adminId, playerAId, playerBId]) {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.walletTransaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe("full game lifecycle: create -> join -> play -> win", () => {
  it("takes a game from DRAFT to a completed win with the correct wallet credit", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    expect(game.status).toBe("DRAFT");
    expect(game.seedCommitmentHash).toHaveLength(64);

    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);

    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await purchaseTickets({ gameId: game.id, userId: playerBId, ticketCount: 1 });

    const started = await startGame(game.id, adminId);
    expect(started.status).toBe("STARTING");

    await vi.waitFor(
      async () => {
        const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
        expect(g.status).toBe("LIVE");
      },
      { timeout: 15000, interval: 200 },
    );

    // Rig ticket A's card so it deterministically wins "One Horizontal Line".
    const gameRow = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    const seed = decryptSecret(gameRow.secretSeedEncrypted!);
    const { card, callsNeeded } = await craftWinningCard(seed, 0);
    const ticketA = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    await prisma.bingoTicket.update({ where: { id: ticketA.id }, data: { cardNumbers: card as unknown as object } });

    let lastGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    for (let i = 0; i < callsNeeded && lastGame.status === "LIVE"; i++) {
      await callNextNumber(game.id, adminId);
      lastGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    }

    expect(lastGame.status).toBe("COMPLETED");
    expect(lastGame.seedRevealedAt).not.toBeNull();

    const winner = await prisma.winner.findUnique({ where: { ticketId: ticketA.id } });
    expect(winner).not.toBeNull();
    expect(winner!.userId).toBe(playerAId);

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    // -10 (ticket) + prize > 0 net change expected since prize pool > ticket price for a 2-ticket pool.
    expect(walletAfter.availableBalance.toString()).not.toBe(before.availableBalance.toString());
    expect(Number(winner!.prizeAmount)).toBeGreaterThan(0);
  }, 30000);
});

describe("simultaneous winners share the prize pool", () => {
  it("records both winners on the same call and splits the pool", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await purchaseTickets({ gameId: game.id, userId: playerBId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    const gameRow = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    const seed = decryptSecret(gameRow.secretSeedEncrypted!);
    const { card, callsNeeded } = await craftWinningCard(seed, 0);

    const ticketA = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    const ticketB = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerBId } });
    await prisma.bingoTicket.update({ where: { id: ticketA.id }, data: { cardNumbers: card as unknown as object } });
    await prisma.bingoTicket.update({ where: { id: ticketB.id }, data: { cardNumbers: card as unknown as object } });

    let lastGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    for (let i = 0; i < callsNeeded && lastGame.status === "LIVE"; i++) {
      await callNextNumber(game.id, adminId);
      lastGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    }

    const winners = await prisma.winner.findMany({ where: { gameId: game.id } });
    expect(winners).toHaveLength(2);
    expect(winners[0]!.splitCount).toBe(2);
    expect(winners[1]!.splitCount).toBe(2);
    // Same call number for both — genuinely simultaneous.
    expect(winners[0]!.calledSequenceNumber).toBe(winners[1]!.calledSequenceNumber);
    const totalPaid = winners.reduce((sum, w) => sum.plus(w.prizeAmount), winners[0]!.prizeAmount.minus(winners[0]!.prizeAmount));
    expect(totalPaid.toNumber()).toBeGreaterThan(0);
  }, 30000);
});

describe("the game:winner broadcast carries the winner's username", () => {
  it("includes a real username, not a blank placeholder, so spectators see who won live", async () => {
    // Regression test: the client used to hardcode username: "" for this
    // event (see GameRoom.tsx history), so every non-winning player saw
    // only "Ticket #N won" with no identity, contradicting the product
    // requirement that spectators see who won — found live in the browser,
    // fixed by including `user: { select: { username: true } }` in
    // winners.ts's ticket query and publishing it on the broadcast.
    const game = await makeGame({ maxPlayers: 5 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    const gameRow = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    const seed = decryptSecret(gameRow.secretSeedEncrypted!);
    const { card, callsNeeded } = await craftWinningCard(seed, 0);
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    await prisma.bingoTicket.update({ where: { id: ticket.id }, data: { cardNumbers: card as unknown as object } });

    const publishSpy = vi.spyOn(getGameBroadcaster(), "publish");
    let lastGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    for (let i = 0; i < callsNeeded && lastGame.status === "LIVE"; i++) {
      await callNextNumber(game.id, adminId);
      lastGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    }

    const player = await prisma.user.findUniqueOrThrow({ where: { id: playerAId } });
    const winnerCall = publishSpy.mock.calls.find((call) => call[1] === "game:winner");
    expect(winnerCall).toBeDefined();
    const payload = winnerCall![2] as { username?: string; ticketId?: string };
    expect(payload.username).toBe(player.username);
    expect(payload.ticketId).toBe(ticket.id);
    publishSpy.mockRestore();
  }, 30000);
});

describe("ticket purchase validation", () => {
  it("rejects insufficient balance", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    const poorUserId = await makeUser("poor", 1);
    await expect(purchaseTickets({ gameId: game.id, userId: poorUserId, ticketCount: 1 })).rejects.toThrow();
    await prisma.wallet.deleteMany({ where: { userId: poorUserId } });
    await prisma.user.delete({ where: { id: poorUserId } });
  });

  it("rejects purchases once registration has closed", async () => {
    const now = Date.now();
    const game = await makeGame({
      maxPlayers: 5,
      registrationOpenAt: new Date(now - 10000),
      registrationCloseAt: new Date(now - 1000),
    });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await expect(purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 })).rejects.toThrow(/registration has closed/i);
  });

  it("rejects exceeding maxTicketsPerPlayer", async () => {
    const game = await makeGame({ maxPlayers: 5, maxTicketsPerPlayer: 2 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 2 });
    await expect(purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 })).rejects.toThrow(/at most 2 tickets/i);
  });

  it("rejects a new player once the game reaches maxPlayers", async () => {
    const game = await makeGame({ maxPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    const full = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(full.status).toBe("FULL");
    await expect(purchaseTickets({ gameId: game.id, userId: playerBId, ticketCount: 1 })).rejects.toThrow(/capacity/i);
  });
});

describe("concurrency: ticket purchase capacity race", () => {
  it("never oversells beyond maxPlayers under concurrent purchase attempts", async () => {
    const capacity = 8;
    const contenders = 20;
    const game = await makeGame({ maxPlayers: capacity, maxTicketsPerPlayer: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);

    const userIds = await Promise.all(Array.from({ length: contenders }, (_, i) => makeUser(`racer${i}`, 1000)));

    const results = await Promise.allSettled(
      userIds.map((userId) => purchaseTickets({ gameId: game.id, userId, ticketCount: 1 })),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded.length).toBe(capacity);
    expect(failed.length).toBe(contenders - capacity);

    const playerCount = await prisma.gamePlayer.count({ where: { gameId: game.id } });
    expect(playerCount).toBe(capacity);
    const ticketCount = await prisma.bingoTicket.count({ where: { gameId: game.id } });
    expect(ticketCount).toBe(capacity);

    // These racer tickets are about to be hard-deleted along with their
    // users below, without going through the normal cancel/refund flow —
    // settle the game's platform-ledger footprint first so it doesn't
    // orphan on the shared PlatformAccount.
    await reverseGamePlatformFootprint(game.id);

    for (const userId of userIds) {
      await prisma.bingoTicket.deleteMany({ where: { userId, gameId: game.id } });
      await prisma.gamePlayer.deleteMany({ where: { userId, gameId: game.id } });
      await prisma.walletTransaction.deleteMany({ where: { userId } });
      await prisma.wallet.deleteMany({ where: { userId } });
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  }, 60000);
});

describe("concurrency: game start race", () => {
  it("only one of two simultaneous startGame() calls succeeds", async () => {
    const game = await makeGame({ maxPlayers: 5, minPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });

    const results = await Promise.allSettled([startGame(game.id, adminId), startGame(game.id, adminId)]);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });
});

describe("concurrency: callNextNumber races", () => {
  it("N concurrent calls consume exactly N distinct, sequential numbers — no duplicates, no skips", async () => {
    const game = await makeGame({ maxPlayers: 5, minPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    const concurrentCalls = 10;
    await Promise.allSettled(Array.from({ length: concurrentCalls }, () => callNextNumber(game.id, adminId)));

    const called = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
    expect(called.length).toBeLessThanOrEqual(concurrentCalls);
    expect(new Set(called.map((c) => c.ballNumber)).size).toBe(called.length); // no duplicate balls
    expect(called.map((c) => c.sequenceNumber)).toEqual(called.map((_, i) => i + 1)); // exact 1..N sequence, no gaps

    const finalGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    if (finalGame.status === "LIVE") {
      expect(finalGame.calledCount).toBe(called.length);
    }
  }, 30000);
});

describe("state durability / recovery", () => {
  it("calling again after 'restart' (fresh reads, no in-memory state) continues the sequence correctly, never repeating a ball", async () => {
    const game = await makeGame({ maxPlayers: 5, minPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    await callNextNumber(game.id, adminId);
    await callNextNumber(game.id, adminId);
    const beforeRestart = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
    expect(beforeRestart).toHaveLength(2);

    // "Restart": nothing but a fresh DB read informs the next call — no
    // process-local cache of calledCount or the sequence position exists
    // outside what's already persisted.
    const freshGameRead = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(freshGameRead.calledCount).toBe(2);

    await callNextNumber(game.id, adminId);
    const afterRestart = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
    expect(afterRestart).toHaveLength(3);
    expect(afterRestart[2]!.sequenceNumber).toBe(3);
    expect(new Set(afterRestart.map((n) => n.ballNumber)).size).toBe(3); // still no repeats
  }, 30000);
});

describe("invalid transitions are rejected end to end", () => {
  it("cannot start a DRAFT game (must go through SCHEDULED/OPEN first)", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await expect(startGame(game.id, adminId)).rejects.toThrow();
  });

  it("cannot pause a game that isn't LIVE", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await expect(pauseGame(game.id, adminId)).rejects.toThrow();
  });

  it("cannot resume a game that isn't PAUSED", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await expect(resumeGame(game.id, adminId)).rejects.toThrow();
  });

  it("cannot act on an already-completed game", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await cancelGame(game.id, adminId, "test cleanup");
    await expect(startGame(game.id, adminId)).rejects.toThrow();
    await expect(callNextNumber(game.id, adminId)).rejects.toThrow();
  });
});

describe("pause / resume preserves the call sequence", () => {
  it("stops accepting calls while PAUSED and resumes with no numbers lost or duplicated", async () => {
    const game = await makeGame({ maxPlayers: 5, minPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    await callNextNumber(game.id, adminId);
    await callNextNumber(game.id, adminId);
    const beforePause = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
    expect(beforePause).toHaveLength(2);

    const paused = await pauseGame(game.id, adminId);
    expect(paused.status).toBe("PAUSED");

    // No calls can land while PAUSED — callNextNumber only accepts LIVE.
    await expect(callNextNumber(game.id, adminId)).rejects.toThrow(/PAUSED/);
    const duringPause = await prisma.bingoNumber.findMany({ where: { gameId: game.id } });
    expect(duringPause).toHaveLength(2); // unchanged while paused

    const resumed = await resumeGame(game.id, adminId);
    expect(resumed.status).toBe("LIVE");

    await callNextNumber(game.id, adminId);
    const afterResume = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
    expect(afterResume).toHaveLength(3);
    // Sequence continues 1,2,3 — no gap, no repeat introduced by the pause/resume cycle.
    expect(afterResume.map((n) => n.sequenceNumber)).toEqual([1, 2, 3]);
    expect(new Set(afterResume.map((n) => n.ballNumber)).size).toBe(3);
    // The first two calls are byte-for-byte the same rows as before the pause.
    expect(afterResume[0]!.ballNumber).toBe(beforePause[0]!.ballNumber);
    expect(afterResume[1]!.ballNumber).toBe(beforePause[1]!.ballNumber);
  }, 30000);
});

describe("completed games are immutable", () => {
  it("rejects further status transitions, ticket purchases, and number calls once COMPLETED", async () => {
    const game = await makeGame({ maxPlayers: 5, minPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    const completed = await completeGame(game.id, adminId, "Forced completion for immutability test.");
    expect(completed.status).toBe("COMPLETED");

    // No further status transitions.
    await expect(pauseGame(game.id, adminId)).rejects.toThrow();
    await expect(resumeGame(game.id, adminId)).rejects.toThrow();
    await expect(startGame(game.id, adminId)).rejects.toThrow();
    await expect(cancelGame(game.id, adminId, "too late")).rejects.toThrow();

    // No further ticket purchases.
    await expect(purchaseTickets({ gameId: game.id, userId: playerBId, ticketCount: 1 })).rejects.toThrow();

    // No further number calls.
    await expect(callNextNumber(game.id, adminId)).rejects.toThrow(/COMPLETED/);

    const finalGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(finalGame.status).toBe("COMPLETED"); // still exactly COMPLETED — none of the rejected calls mutated it
  }, 30000);
});

describe("cancellation refunds active tickets", () => {
  it("refunds every active ticket and voids them on cancel", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 2 });
    const afterPurchase = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    expect(afterPurchase.availableBalance.toString()).not.toBe(before.availableBalance.toString());

    await cancelGame(game.id, adminId, "Not enough interest tonight.");

    const afterCancel = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    expect(afterCancel.availableBalance.toString()).toBe(before.availableBalance.toString());

    const tickets = await prisma.bingoTicket.findMany({ where: { gameId: game.id, userId: playerAId } });
    expect(tickets.every((t) => t.status === "REFUNDED")).toBe(true);
  });

  it("cancelling twice never double-refunds (idempotent)", async () => {
    const game = await makeGame({ maxPlayers: 5 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });

    await cancelGame(game.id, adminId, "First cancellation.");
    const afterFirst = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    // cancelGame on an already-CANCELLED game is a no-op transition (see
    // transitionGame's exhaustive state table) — calling it again must not
    // find any ACTIVE tickets left to refund a second time.
    await cancelGame(game.id, adminId, "Retried cancellation request.").catch(() => {});
    const afterSecond = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });

    expect(afterFirst.availableBalance.toString()).toBe(before.availableBalance.toString());
    expect(afterSecond.availableBalance.toString()).toBe(before.availableBalance.toString());
    const refundTxCount = await prisma.walletTransaction.count({ where: { userId: playerAId, relatedGameId: game.id, type: "REFUND" } });
    expect(refundTxCount).toBe(1);
  });

  it("does NOT auto-refund a cancellation from LIVE — flags it for manual Finance review instead", async () => {
    const game = await makeGame({ maxPlayers: 5, minPlayers: 1 });
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    const afterPurchase = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    expect(afterPurchase.availableBalance.toString()).not.toBe(before.availableBalance.toString()); // ticket price was debited
    await startGame(game.id, adminId);
    await vi.waitFor(async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(g.status).toBe("LIVE");
    }, { timeout: 15000, interval: 200 });

    await cancelGame(game.id, adminId, "Emergency: technical failure.");

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityType: "Game", entityId: game.id, action: "GAME_EMERGENCY_CANCELLED" },
    });
    expect(auditLog).not.toBeNull();

    const reviewLog = await prisma.auditLog.findFirst({
      where: { entityType: "Game", entityId: game.id, action: "GAME_CANCELLED_LIVE_REQUIRES_MANUAL_REFUND_REVIEW" },
    });
    expect(reviewLog).not.toBeNull();

    // No automatic refund: balance stays exactly where it was right after
    // purchase (still debited), unchanged by the cancellation itself.
    const after = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    expect(after.availableBalance.toString()).toBe(afterPurchase.availableBalance.toString());

    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    expect(ticket.status).toBe("ACTIVE"); // left ACTIVE, not silently voided, pending manual review
  }, 20000);
});
