import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@bingo/db";
import { createGame, openGame, scheduleGame, startGame, callNextNumber } from "./engine";
import { purchaseTickets } from "./tickets";
import { submitBingoClaim, confirmBingoClaim, rejectBingoClaim } from "./claims";
import { setWinningStages } from "./winning-stages";
import { applyPlatformLedgerEntry } from "./platform-ledger";

// Integration tests — require a real Postgres reachable via DATABASE_URL.

let adminId: string;
let playerAId: string;
let playerBId: string;
let horizontalLineId: string;
let fourCornersId: string;
let fullHouseId: string;
let prizeRuleId: string;
const createdGameIds: string[] = [];

async function makeUser(label: string, balance: number) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: `Claims Test ${label}`,
      username: `claims_${label}_${suffix}`,
      email: `claims_${label}_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "4").padEnd(8, "4").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `CLM${label}${suffix.toUpperCase()}`,
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

async function makeLiveGame(overrides: Partial<Parameters<typeof createGame>[0]> = {}) {
  const game = await createGame(
    {
      name: `Claims Test Game ${randomUUID().slice(0, 6)}`,
      ...futureWindow(),
      ticketPrice: 10,
      maxPlayers: 10,
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
  await scheduleGame(game.id, adminId);
  await openGame(game.id, adminId);
  return game;
}

async function goLive(gameId: string) {
  await startGame(gameId, adminId);
  await vi.waitFor(
    async () => {
      const g = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
      expect(g.status).toBe("LIVE");
    },
    { timeout: 15000, interval: 200 },
  );
}

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

async function reverseGamePlatformFootprint(gameId: string) {
  const net = await computeGameNet(gameId);
  if (net.isZero()) return;
  // Positive net (the usual case: sales-derived reservation exceeded what
  // was paid out) reverses as a REFUND (debit). This suite also exercises
  // fixed-per-stage prizes that can legitimately exceed sales-derived
  // reservation — a genuinely negative net footprint — which needs the
  // opposite: crediting the platform account back up by the deficit.
  // PRIZE_POOL_CONTRIBUTION is reused here purely for its +1 sign; this
  // reversal entry is tagged with its own distinctive referenceId, never
  // mistaken for a real contribution.
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
  playerAId = await makeUser("playerA", 10000);
  playerBId = await makeUser("playerB", 10000);

  horizontalLineId = (await prisma.winningPattern.findUniqueOrThrow({ where: { name: "One Horizontal Line" } })).id;
  fourCornersId = (await prisma.winningPattern.findUniqueOrThrow({ where: { name: "Four Corners" } })).id;
  fullHouseId = (await prisma.winningPattern.findUniqueOrThrow({ where: { name: "Full House (Blackout)" } })).id;
  prizeRuleId = (await prisma.prizeRule.findUniqueOrThrow({ where: { name: "Standard 70/30 Split" } })).id;
});

afterAll(async () => {
  // Settle money first, credits (negative net) before debits (positive
  // net) — reversing in raw creation order can ask the shared
  // PlatformAccount to cover a debit before this file's own credits have
  // landed, tripping the insufficient-funds guard even though the file's
  // *total* footprint nets out fine (e.g. -30/+20/-30/+10/+20 here). The
  // guard is doing its job; the bug was processing order, not the amounts.
  const nets = await Promise.all(createdGameIds.map(async (gameId) => ({ gameId, net: await computeGameNet(gameId) })));
  nets.sort((a, b) => a.net.comparedTo(b.net));
  for (const { gameId } of nets) {
    await reverseGamePlatformFootprint(gameId);
  }

  for (const gameId of createdGameIds) {
    await prisma.winner.deleteMany({ where: { gameId } });
    await prisma.bingoClaim.deleteMany({ where: { gameId } });
    await prisma.winningStage.deleteMany({ where: { gameId } });
    await prisma.gameEvent.deleteMany({ where: { gameId } });
    await prisma.bingoNumber.deleteMany({ where: { gameId } });
    await prisma.walletTransaction.deleteMany({ where: { relatedGameId: gameId } });
    await prisma.bingoTicket.deleteMany({ where: { gameId } });
    await prisma.gamePlayer.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
  for (const userId of [adminId, playerAId, playerBId]) {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    // A confirmed winner now posts a real Announcement (createdByUserId:
    // the confirming actor) — that FK is NOT NULL/RESTRICT, unlike
    // Announcement.gameId (nullable, SET NULL), so it must be cleared
    // before the user row can be hard-deleted below.
    await prisma.announcement.deleteMany({ where: { createdByUserId: userId } });
    await prisma.walletTransaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe("submitBingoClaim / confirmBingoClaim — the core human-claim flow", () => {
  it("a valid claim is PENDING until an operator confirms it, then pays out and completes the game", async () => {
    const game = await makeLiveGame();
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    await goLive(game.id);

    // Call every number in the ticket's row 0 (B/I/N/G/O column-0 values).
    const card = ticket.cardNumbers as unknown as { B: number[]; I: number[]; N: (number | null)[]; G: number[]; O: number[] };
    const row0 = [card.B[0]!, card.I[0]!, card.N[0]!, card.G[0]!, card.O[0]!];
    // Call the whole deck until every row-0 number has landed — MANUAL mode, so we call deterministically from the committed sequence.
    for (let i = 0; i < 75; i++) {
      const current = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      if (current.status !== "LIVE") break;
      const called = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, select: { ballNumber: true } });
      const calledSet = new Set(called.map((c) => c.ballNumber));
      if (row0.every((n) => calledSet.has(n))) break;
      await callNextNumber(game.id, adminId);
    }

    const claimResult = await submitBingoClaim({ gameId: game.id, ticketId: ticket.id, userId: playerAId });
    expect(claimResult.won).toBe(true);
    expect(claimResult.claim.confirmationStatus).toBe("PENDING");

    // Not paid yet — still just PENDING.
    const walletMid = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    expect(walletMid.availableBalance.toNumber()).toBeLessThan(10000); // only the ticket purchase has landed

    const { confirmed } = await confirmBingoClaim(claimResult.claim.id, adminId);
    expect(confirmed).toHaveLength(1);

    const finished = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(finished.status).toBe("COMPLETED");

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerAId } });
    expect(walletAfter.availableBalance.toNumber()).toBeGreaterThan(walletMid.availableBalance.toNumber());
  }, 30000);

  it("an invalid claim is auto-rejected immediately and never pays", async () => {
    const game = await makeLiveGame();
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    await goLive(game.id);
    // No numbers called at all — the card cannot possibly satisfy any row.

    const result = await submitBingoClaim({ gameId: game.id, ticketId: ticket.id, userId: playerAId });
    expect(result.won).toBe(false);
    expect(result.claim.validationStatus).toBe("INVALID");
    expect(result.claim.confirmationStatus).toBe("REJECTED"); // system-resolved, no operator action needed

    const winner = await prisma.winner.findUnique({ where: { ticketId: ticket.id } });
    expect(winner).toBeNull();
  }, 30000);

  it("a player cannot claim on a ticket that isn't theirs", async () => {
    const game = await makeLiveGame();
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    await goLive(game.id);

    await expect(submitBingoClaim({ gameId: game.id, ticketId: ticket.id, userId: playerBId })).rejects.toThrow();
  }, 30000);

  it("operator can reject a system-valid claim without paying it", async () => {
    const game = await makeLiveGame();
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    const ticket = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    await goLive(game.id);

    const card = ticket.cardNumbers as unknown as { B: number[]; I: number[]; N: (number | null)[]; G: number[]; O: number[] };
    const row0 = [card.B[0]!, card.I[0]!, card.N[0]!, card.G[0]!, card.O[0]!];
    for (let i = 0; i < 75; i++) {
      const current = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      if (current.status !== "LIVE") break;
      const called = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, select: { ballNumber: true } });
      const calledSet = new Set(called.map((c) => c.ballNumber));
      if (row0.every((n) => calledSet.has(n))) break;
      await callNextNumber(game.id, adminId);
    }

    const result = await submitBingoClaim({ gameId: game.id, ticketId: ticket.id, userId: playerAId });
    const rejected = await rejectBingoClaim(result.claim.id, adminId, "Suspected card tampering — manual review.");
    expect(rejected.confirmationStatus).toBe("REJECTED");

    const winner = await prisma.winner.findUnique({ where: { ticketId: ticket.id } });
    expect(winner).toBeNull();
    // The game is left running — an operator rejection is not a game-ending event.
    const stillLive = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(stillLive.status).toBe("LIVE");
  }, 30000);
});

describe("false-Bingo policy — Section 16/17", () => {
  it("escalates per PLAYER across the game: warn, then disqualify the card, then remove the player entirely", async () => {
    const game = await makeLiveGame({ falseBingoPolicy: { warnAt: 1, disqualifyCardAt: 2, removePlayerAt: 3 } });
    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 2 });
    const tickets = await prisma.bingoTicket.findMany({ where: { gameId: game.id, userId: playerAId }, orderBy: { ticketNumber: "asc" } });
    await goLive(game.id);
    // Nothing called — every claim on these cards is guaranteed false.

    const first = await submitBingoClaim({ gameId: game.id, ticketId: tickets[0]!.id, userId: playerAId });
    expect(first.penalty).toBe("WARNING");

    const second = await submitBingoClaim({ gameId: game.id, ticketId: tickets[0]!.id, userId: playerAId });
    expect(second.penalty).toBe("CARD_DISQUALIFIED");
    const ticket0After = await prisma.bingoTicket.findUniqueOrThrow({ where: { id: tickets[0]!.id } });
    expect(ticket0After.status).toBe("DISQUALIFIED");

    // The disqualified card can never claim again...
    await expect(submitBingoClaim({ gameId: game.id, ticketId: tickets[0]!.id, userId: playerAId })).rejects.toThrow();

    // ...but the SAME player's other card can still try, and its false claim
    // is the player's 3rd overall — removing the player entirely, which
    // disqualifies every one of their remaining active cards too.
    const third = await submitBingoClaim({ gameId: game.id, ticketId: tickets[1]!.id, userId: playerAId });
    expect(third.penalty).toBe("PLAYER_REMOVED");

    const ticket1After = await prisma.bingoTicket.findUniqueOrThrow({ where: { id: tickets[1]!.id } });
    expect(ticket1After.status).toBe("DISQUALIFIED");
  }, 30000);
});

describe("multiple winning stages — Section 6/21", () => {
  it("enforces each stage's winnerLimit atomically and rejects a claim for an already-full stage", async () => {
    const game = await makeLiveGame({ winningPatternId: fourCornersId });
    await setWinningStages(
      game.id,
      [
        { order: 1, patternId: fourCornersId, label: "1st Prize", prizeAmount: 50, winnerLimit: 1 },
        { order: 2, patternId: fullHouseId, label: "Final Prize", prizeAmount: 100, winnerLimit: 1 },
      ],
      adminId,
    );
    const stages = await prisma.winningStage.findMany({ where: { gameId: game.id }, orderBy: { order: "asc" } });
    const cornersStage = stages[0]!;

    await purchaseTickets({ gameId: game.id, userId: playerAId, ticketCount: 1 });
    await purchaseTickets({ gameId: game.id, userId: playerBId, ticketCount: 1 });
    const ticketA = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerAId } });
    const ticketB = await prisma.bingoTicket.findFirstOrThrow({ where: { gameId: game.id, userId: playerBId } });

    // Give both cards identical, guaranteed-called corner numbers (1, 15, 61, 75 — the four corners of any standard card layout here).
    const cornersCard = {
      B: [1, 2, 3, 4, 15],
      I: [16, 17, 18, 19, 20],
      N: [31, 32, null, 34, 35],
      G: [46, 47, 48, 49, 50],
      O: [61, 62, 63, 64, 75],
    };
    await prisma.bingoTicket.update({ where: { id: ticketA.id }, data: { cardNumbers: cornersCard } });
    await prisma.bingoTicket.update({ where: { id: ticketB.id }, data: { cardNumbers: cornersCard } });

    await goLive(game.id);
    // Call numbers (MANUAL mode calls the committed sequence in order) until all four corner values have landed.
    for (let i = 0; i < 75; i++) {
      const current = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      if (current.status !== "LIVE") break;
      const called = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, select: { ballNumber: true } });
      const calledSet = new Set(called.map((c) => c.ballNumber));
      if ([1, 15, 61, 75].every((n) => calledSet.has(n))) break;
      await callNextNumber(game.id, adminId);
    }

    const claimA = await submitBingoClaim({ gameId: game.id, ticketId: ticketA.id, userId: playerAId, stageId: cornersStage.id });
    const claimB = await submitBingoClaim({ gameId: game.id, ticketId: ticketB.id, userId: playerBId, stageId: cornersStage.id });
    expect(claimA.won).toBe(true);
    expect(claimB.won).toBe(true);

    // Confirm A first — fills the stage's only slot.
    const { confirmed: confirmedA } = await confirmBingoClaim(claimA.claim.id, adminId);
    expect(confirmedA).toHaveLength(1);

    const stageAfter = await prisma.winningStage.findUniqueOrThrow({ where: { id: cornersStage.id } });
    expect(stageAfter.status).toBe("COMPLETED");
    expect(stageAfter.winnerCount).toBe(1);

    // Confirming B's claim for the same now-full stage must NOT create a
    // second winner — the atomic winnerLimit check rejects it instead.
    const { confirmed: confirmedB, rejected: rejectedB } = await confirmBingoClaim(claimB.claim.id, adminId);
    expect(confirmedB).toHaveLength(0);
    expect(rejectedB).toHaveLength(1);

    const winnersForStage = await prisma.winner.count({ where: { winningStageId: cornersStage.id } });
    expect(winnersForStage).toBe(1);
  }, 30000);
});
