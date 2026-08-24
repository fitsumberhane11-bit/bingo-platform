import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@bingo/db";
import { hashPassword } from "./password";
import { decryptSecret } from "./crypto";
import { deriveCallSequence } from "@bingo/game-core";
import { applyPlatformLedgerEntry } from "./game/platform-ledger";

/**
 * Real HTTP-level security tests — these hit an actually-running Next.js
 * server with `fetch()` and real cookies, not just the underlying TS
 * functions. This is what proves permission checks, the controlled-mode
 * ball-selection guarantee, and secret-leakage guards hold at the actual
 * request/response boundary an attacker would touch, not merely inside a
 * function nobody can reach without going through that boundary anyway.
 *
 * Requires a real Next.js server reachable at TEST_SERVER_URL (defaults to
 * the local dev/preview server on :3010). Skips with a clear message if
 * unreachable, rather than failing in environments with no server running.
 */
const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:3010";
const TEST_PASSWORD = "HttpSecTest123!";

// Reachability must be known at collection time (before any `describe`/`it`
// runs) since `describe.skip` can't be decided inside an async beforeAll —
// hence the top-level await here rather than setting a flag in beforeAll.
const serverReachable = await fetch(`${BASE_URL}/api/auth/me`)
  .then((res) => res.status === 200 || res.status === 401)
  .catch(() => false);

async function login(identifier: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: TEST_PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`Login failed for ${identifier}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function apiFetch(path: string, opts: { method?: string; cookie?: string; body?: unknown; secFetchSite?: string } = {}) {
  return fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.secFetchSite ? { "Sec-Fetch-Site": opts.secFetchSite } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

let playerACookie: string;
let playerBCookie: string;
let operatorCookie: string;
let superAdminCookie: string;
let playerAId: string;
const createdUserIds: string[] = [];
const createdGameIds: string[] = [];
const createdPrizeRuleIds: string[] = [];
let playerBPaymentId: string;

async function makeUser(label: string, roleName: string | null) {
  const suffix = randomUUID().slice(0, 8);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const roleId = roleName ? (await prisma.role.findUniqueOrThrow({ where: { name: roleName } })).id : null;
  const user = await prisma.user.create({
    data: {
      fullName: `HTTP Sec Test ${label}`,
      username: `httpsec_${label}_${suffix}`,
      email: `httpsec_${label}_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "4").padEnd(8, "4").slice(0, 8)}`,
      passwordHash,
      referralCode: `HTS${label}${suffix.toUpperCase()}`,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      wallet: { create: { availableBalance: 1000, pendingBalance: 0 } },
      ...(roleId ? { roles: { create: { roleId } } } : {}),
    },
  });
  createdUserIds.push(user.id);
  return user;
}

beforeAll(async () => {
  if (!serverReachable) return;

  const [playerA, playerB, operator, superAdmin] = await Promise.all([
    makeUser("playerA", null),
    makeUser("playerB", null),
    makeUser("operator", "GAME_OPERATOR"),
    makeUser("superadmin", "SUPER_ADMIN"),
  ]);
  playerAId = playerA.id;

  [playerACookie, playerBCookie, operatorCookie, superAdminCookie] = await Promise.all([
    login(playerA.username),
    login(playerB.username),
    login(operator.username),
    login(superAdmin.username),
  ]);

  const payment = await prisma.payment.create({
    data: {
      userId: playerB.id,
      provider: "MOCK",
      amount: 100,
      idempotencyKey: `httpsec-${randomUUID()}`,
      status: "SUCCESS",
    },
  });
  playerBPaymentId = payment.id;
});

/**
 * Reverses this game's entire net contribution to the shared, permanent
 * PlatformAccount before afterAll hard-deletes its owning users below.
 * These games are created via real ticket purchases against a live
 * server, crediting PLATFORM_FEE_REVENUE/PRIZE_POOL_CONTRIBUTION on that
 * persistent singleton; once the purchasing wallet is deleted, nothing
 * backs that money anymore and the platform-wide conservation check
 * (Total Deposits − Total Withdrawals + Adjustments == ΣWallet Balances +
 * PlatformAccount Balance) drifts by exactly that amount forever.
 * Deliberately does NOT delete the PlatformLedgerEntry rows themselves
 * (they're immutable financial history) — only reverses the net balance
 * they represent, via one offsetting entry per game. Self-idempotent: the
 * reversal entry is itself tagged with this game's id, so summing again
 * nets to zero and nothing further is written.
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

afterAll(async () => {
  for (const gameId of createdGameIds) {
    await reverseGamePlatformFootprint(gameId);
    await prisma.winner.deleteMany({ where: { gameId } });
    await prisma.gameEvent.deleteMany({ where: { gameId } });
    await prisma.bingoNumber.deleteMany({ where: { gameId } });
    await prisma.walletTransaction.deleteMany({ where: { relatedGameId: gameId } });
    await prisma.bingoTicket.deleteMany({ where: { gameId } });
    await prisma.gamePlayer.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
  if (playerBPaymentId) await prisma.payment.deleteMany({ where: { id: playerBPaymentId } });
  if (createdPrizeRuleIds.length > 0) await prisma.prizeRule.deleteMany({ where: { id: { in: createdPrizeRuleIds } } });
  for (const userId of createdUserIds) {
    await prisma.session.deleteMany({ where: { userId } }); // real logins in these tests create real Session rows
    await prisma.loginAttempt.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.walletTransaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!serverReachable)("HTTP-level security matrix", () => {
  it("unauthenticated request to admin game control is rejected with 401", async () => {
    const res = await apiFetch("/api/admin/games/00000000-0000-0000-0000-000000000000/call-next", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("a request the browser flags Sec-Fetch-Site: cross-site is rejected on any mutating method, even with a valid session cookie (CSRF defense-in-depth)", async () => {
    const res = await apiFetch("/api/admin/games/00000000-0000-0000-0000-000000000000/pause", {
      method: "POST",
      cookie: superAdminCookie,
      secFetchSite: "cross-site",
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");

    // Same request, same-origin, is NOT blocked by this check (falls through
    // to the normal not-found response for a nonexistent game id) — proving
    // the check is scoped to cross-site, not blocking legitimate requests.
    const sameOrigin = await apiFetch("/api/admin/games/00000000-0000-0000-0000-000000000000/pause", {
      method: "POST",
      cookie: superAdminCookie,
      secFetchSite: "same-origin",
    });
    expect(sameOrigin.status).not.toBe(403);
  });

  it("a player cannot create games (403)", async () => {
    const res = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: playerACookie,
      body: { name: "Should not be created" },
    });
    expect(res.status).toBe(403);
  });

  it("a player cannot read another player's payment (403)", async () => {
    const res = await apiFetch(`/api/payments/${playerBPaymentId}`, { cookie: playerACookie });
    expect(res.status).toBe(403);
  });

  it("a player CAN read their own payment (200)", async () => {
    const own = await prisma.payment.create({
      data: { userId: playerAId, provider: "MOCK", amount: 50, idempotencyKey: `httpsec-own-${randomUUID()}`, status: "SUCCESS" },
    });
    const res = await apiFetch(`/api/payments/${own.id}`, { cookie: playerACookie });
    expect(res.status).toBe(200);
    await prisma.payment.deleteMany({ where: { id: own.id } });
  });

  it("a GAME_OPERATOR cannot reach financial admin APIs (wallet adjustment) — 403", async () => {
    const res = await apiFetch(`/api/admin/wallet/${playerAId}/adjust`, {
      method: "POST",
      cookie: operatorCookie,
      body: { amount: 100, direction: "CREDIT", reason: "should be forbidden" },
    });
    expect(res.status).toBe(403);
  });

  it("a player cannot send announcements (403)", async () => {
    const res = await apiFetch("/api/admin/announcements", {
      method: "POST",
      cookie: playerACookie,
      body: { message: "players cannot do this", targetType: "ALL" },
    });
    expect(res.status).toBe(403);
  });

  it("a player cannot pause/modify a game they don't control (403)", async () => {
    const res = await apiFetch("/api/admin/games/00000000-0000-0000-0000-000000000000/pause", {
      method: "POST",
      cookie: playerACookie,
    });
    expect(res.status).toBe(403); // permission check runs before the not-found check, so this proves the RBAC gate itself, not a lookup miss
  });

  it("a GAME_OPERATOR CAN legitimately call GAME_START/GAME_CALL_NUMBER (the permission split is real, not all-or-nothing)", async () => {
    const patternsRes = await apiFetch("/api/admin/winning-patterns", { cookie: superAdminCookie });
    const rulesRes = await apiFetch("/api/admin/prize-rules", { cookie: superAdminCookie });
    const { patterns } = (await patternsRes.json()).data;
    const { rules } = (await rulesRes.json()).data;
    const now = Date.now();
    const createRes = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: superAdminCookie,
      body: {
        name: `HTTP Security Operator Permission Test ${randomUUID().slice(0, 6)}`,
        gameDate: new Date(now).toISOString(),
        registrationOpenAt: new Date(now - 60_000).toISOString(),
        registrationCloseAt: new Date(now + 3_600_000).toISOString(),
        startTime: new Date(now + 3_600_000).toISOString(),
        ticketPrice: 10,
        maxPlayers: 10,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 3,
        callMode: "MANUAL",
        winningPatternId: patterns[0].id,
        prizeRuleId: rules[0].id,
      },
    });
    const { game } = (await createRes.json()).data;
    createdGameIds.push(game.id);

    // As of the 2026-08-17 permission matrix, GAME_OPERATOR holds
    // GAME_CREATE/GAME_EDIT (operators run the full game lifecycle, picking
    // from existing prize rules/patterns) — confirm that positively — but
    // still does NOT hold PRIZE_RULE_MANAGE (defining the rules that
    // determine payouts stays out of operator reach), proving the split is
    // real and not all-or-nothing now that operators have more game access.
    const operatorScheduleAttempt = await apiFetch(`/api/admin/games/${game.id}/schedule`, { method: "POST", cookie: operatorCookie });
    expect(operatorScheduleAttempt.status).toBe(200);

    const operatorPrizeRuleAttempt = await apiFetch("/api/admin/prize-rules", {
      method: "POST",
      cookie: operatorCookie,
      body: {
        name: `Operator-attempted prize rule ${randomUUID().slice(0, 6)}`,
        type: "PERCENTAGE_OF_SALES",
        config: { type: "PERCENTAGE_OF_SALES", winnerPercent: 80 },
        tieBreakRule: "SPLIT_EQUALLY",
        platformFeePercent: 20,
      },
    });
    expect(operatorPrizeRuleAttempt.status).toBe(403);

    await apiFetch(`/api/admin/games/${game.id}/open`, { method: "POST", cookie: superAdminCookie });
    await apiFetch(`/api/admin/games/${game.id}/open`, { method: "POST", cookie: superAdminCookie });
    await apiFetch(`/api/tickets/purchase`, { method: "POST", cookie: playerACookie, body: { gameId: game.id, ticketCount: 1 } });

    const operatorStart = await apiFetch(`/api/admin/games/${game.id}/start`, { method: "POST", cookie: operatorCookie });
    expect(operatorStart.status).toBe(200);
  }, 15000);

  it("a prize rule can be edited while unused, but locks once a game using it leaves DRAFT", async () => {
    const createRes = await apiFetch("/api/admin/prize-rules", {
      method: "POST",
      cookie: superAdminCookie,
      body: {
        name: `HTTP Security Prize Rule Lock Test ${randomUUID().slice(0, 6)}`,
        type: "PERCENTAGE_OF_SALES",
        config: { type: "PERCENTAGE_OF_SALES", winnerPercent: 80 },
        tieBreakRule: "SPLIT_EQUALLY",
        platformFeePercent: 20,
      },
    });
    expect(createRes.status).toBe(201);
    const { rule } = (await createRes.json()).data;
    createdPrizeRuleIds.push(rule.id);

    const editWhileUnused = await apiFetch(`/api/admin/prize-rules/${rule.id}`, {
      method: "PATCH",
      cookie: superAdminCookie,
      body: { platformFeePercent: 25 },
    });
    expect(editWhileUnused.status).toBe(200);

    const patternsRes = await apiFetch("/api/admin/winning-patterns", { cookie: superAdminCookie });
    const { patterns } = (await patternsRes.json()).data;
    const now = Date.now();
    const createGameRes = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: superAdminCookie,
      body: {
        name: `HTTP Security Prize Rule Lock Game ${randomUUID().slice(0, 6)}`,
        gameDate: new Date(now).toISOString(),
        registrationOpenAt: new Date(now - 60_000).toISOString(),
        registrationCloseAt: new Date(now + 3_600_000).toISOString(),
        startTime: new Date(now + 3_600_000).toISOString(),
        ticketPrice: 10,
        maxPlayers: 10,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 3,
        callMode: "MANUAL",
        winningPatternId: patterns[0].id,
        prizeRuleId: rule.id,
      },
    });
    const { game } = (await createGameRes.json()).data;
    createdGameIds.push(game.id);

    // Still DRAFT — the rule should remain editable.
    const editWhileDraft = await apiFetch(`/api/admin/prize-rules/${rule.id}`, {
      method: "PATCH",
      cookie: superAdminCookie,
      body: { platformFeePercent: 30 },
    });
    expect(editWhileDraft.status).toBe(200);

    await apiFetch(`/api/admin/games/${game.id}/schedule`, { method: "POST", cookie: superAdminCookie });

    // No longer DRAFT — locked.
    const editAfterScheduled = await apiFetch(`/api/admin/prize-rules/${rule.id}`, {
      method: "PATCH",
      cookie: superAdminCookie,
      body: { platformFeePercent: 40 },
    });
    expect(editAfterScheduled.status).toBe(409);
  });

  it("call-next ignores any client-supplied ball number — the server alone determines which ball is called", async () => {
    const patternsRes = await apiFetch("/api/admin/winning-patterns", { cookie: superAdminCookie });
    const rulesRes = await apiFetch("/api/admin/prize-rules", { cookie: superAdminCookie });
    const { patterns } = (await patternsRes.json()).data;
    const { rules } = (await rulesRes.json()).data;

    const now = Date.now();
    const createRes = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: superAdminCookie,
      body: {
        name: `HTTP Security Controlled-Mode Test ${randomUUID().slice(0, 6)}`,
        gameDate: new Date(now).toISOString(),
        registrationOpenAt: new Date(now - 60_000).toISOString(),
        registrationCloseAt: new Date(now + 3_600_000).toISOString(),
        startTime: new Date(now + 3_600_000).toISOString(),
        ticketPrice: 10,
        maxPlayers: 10,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 3,
        callMode: "MANUAL",
        winningPatternId: patterns[0].id,
        prizeRuleId: rules[0].id,
      },
    });
    expect(createRes.status).toBe(201);
    const { game } = (await createRes.json()).data;
    createdGameIds.push(game.id);

    await apiFetch(`/api/admin/games/${game.id}/schedule`, { method: "POST", cookie: superAdminCookie });
    await apiFetch(`/api/admin/games/${game.id}/open`, { method: "POST", cookie: superAdminCookie });
    await apiFetch(`/api/tickets/purchase`, { method: "POST", cookie: playerACookie, body: { gameId: game.id, ticketCount: 1 } });
    const startRes = await apiFetch(`/api/admin/games/${game.id}/start`, { method: "POST", cookie: superAdminCookie });
    expect(startRes.status).toBe(200);

    // MANUAL mode with minPlayers already met still runs the STARTING
    // countdown before going LIVE — wait it out.
    await new Promise((r) => setTimeout(r, 12_000));

    // The attack: try to force ball 75 (O-75) via the request body.
    const callRes = await apiFetch(`/api/admin/games/${game.id}/call-next`, {
      method: "POST",
      cookie: superAdminCookie,
      body: { number: 75, ballNumber: 75, ball: 75 },
    });
    expect(callRes.status).toBe(200);
    const { call } = (await callRes.json()).data;

    // Independently recompute what the FIRST called ball must be, straight
    // from the committed seed — without using the game engine's own
    // verification helper, so a shared bug can't hide the manipulation.
    const dbGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    const seed = decryptSecret(dbGame.secretSeedEncrypted!);
    const expectedFirstBall = deriveCallSequence(seed)[0];

    expect(call.ballNumber).toBe(expectedFirstBall);
    // The whole point: this must hold regardless of what the attacker sent.
    // A ball of 75 is only an acceptable result if it's ALSO what the
    // committed sequence says — proven above, not assumed.

    // Secret/future-number leakage checks, using this same still-LIVE game:
    // the raw response bodies (not just typed fields the client happens to
    // read) must never contain the encrypted seed blob or reveal the seed
    // before completion.
    const snapshotRes = await apiFetch(`/api/games/${game.id}`, { cookie: playerACookie });
    const snapshotText = await snapshotRes.text();
    expect(snapshotText).not.toContain("secretSeedEncrypted");
    expect(snapshotText).not.toContain(seed);

    const fairnessRes = await apiFetch(`/api/games/${game.id}/fairness`);
    const fairnessBody = await fairnessRes.json();
    expect(fairnessBody.data.seedRevealed).toBe(false);
    expect(fairnessBody.data.seed).toBeNull();
    expect(fairnessBody.data.verification).toBeNull();
    expect(JSON.stringify(fairnessBody)).not.toContain(seed);

    // The rest of the sequence hasn't been called yet — the remaining
    // uncalled balls must not appear anywhere in the fairness response
    // (only `calledSequence`, which reflects real calls, is present).
    const uncalledBalls = deriveCallSequence(seed).slice(1); // ball[0] was just called above
    expect(fairnessBody.data.calledSequence).toHaveLength(1);
    expect(fairnessBody.data.calledSequence).toEqual([expectedFirstBall]);
    for (const uncalled of uncalledBalls.slice(0, 5)) {
      expect(fairnessBody.data.calledSequence).not.toContain(uncalled);
    }
  }, 30000);

  it("rejects invalid game creation input server-side (negative price, bad registration window)", async () => {
    const patternsRes = await apiFetch("/api/admin/winning-patterns", { cookie: superAdminCookie });
    const rulesRes = await apiFetch("/api/admin/prize-rules", { cookie: superAdminCookie });
    const { patterns } = (await patternsRes.json()).data;
    const { rules } = (await rulesRes.json()).data;
    const now = Date.now();
    const validBase = {
      name: "Validation Test Game",
      gameDate: new Date(now).toISOString(),
      registrationOpenAt: new Date(now).toISOString(),
      registrationCloseAt: new Date(now + 3_600_000).toISOString(),
      startTime: new Date(now + 3_600_000).toISOString(),
      ticketPrice: 10,
      maxPlayers: 10,
      maxTicketsPerPlayer: 5,
      minPlayers: 1,
      callIntervalSeconds: 3,
      callMode: "MANUAL",
      winningPatternId: patterns[0].id,
      prizeRuleId: rules[0].id,
    };

    const negativePrice = await apiFetch("/api/admin/games", { method: "POST", cookie: superAdminCookie, body: { ...validBase, ticketPrice: -5 } });
    expect(negativePrice.status).toBe(400);

    const zeroPrice = await apiFetch("/api/admin/games", { method: "POST", cookie: superAdminCookie, body: { ...validBase, ticketPrice: 0 } });
    expect(zeroPrice.status).toBe(400);

    const zeroMaxPlayers = await apiFetch("/api/admin/games", { method: "POST", cookie: superAdminCookie, body: { ...validBase, maxPlayers: 0 } });
    expect(zeroMaxPlayers.status).toBe(400);

    const registrationClosesAfterStart = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: superAdminCookie,
      body: { ...validBase, registrationCloseAt: new Date(now + 7_200_000).toISOString() }, // after startTime
    });
    expect(registrationClosesAfterStart.status).toBe(400);

    const badInterval = await apiFetch("/api/admin/games", { method: "POST", cookie: superAdminCookie, body: { ...validBase, callIntervalSeconds: 1 } });
    expect(badInterval.status).toBe(400);

    const badPrizePercent = await apiFetch("/api/admin/prize-rules", {
      method: "POST",
      cookie: superAdminCookie,
      body: { name: `Invalid Rule ${randomUUID().slice(0, 6)}`, type: "PERCENTAGE_OF_SALES", config: {}, platformFeePercent: 150 },
    });
    expect(badPrizePercent.status).toBe(400);
  });

  it("an invalid state transition (e.g. cancelling an already-cancelled game) returns a clean 409, not a raw 500", async () => {
    // Regression test for a bug the final acceptance demo's failure-mode
    // checks caught live: InvalidGameTransitionError (thrown by the
    // framework-agnostic game-core state machine) wasn't recognized by
    // withApiHandler's error mapping, so it fell through to a generic 500
    // instead of the 409 every other "conflicting state" error returns.
    // Every unit test that calls transitionGame()/cancelGame() directly and
    // asserts `.rejects.toThrow()` passes regardless of error type, so only
    // a real HTTP round trip exposes this.
    const patternsRes = await apiFetch("/api/admin/winning-patterns", { cookie: superAdminCookie });
    const rulesRes = await apiFetch("/api/admin/prize-rules", { cookie: superAdminCookie });
    const { patterns } = (await patternsRes.json()).data;
    const { rules } = (await rulesRes.json()).data;
    const now = Date.now();
    const createRes = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: superAdminCookie,
      body: {
        name: `HTTP Security Invalid Transition Test ${randomUUID().slice(0, 6)}`,
        gameDate: new Date(now).toISOString(),
        registrationOpenAt: new Date(now - 60_000).toISOString(),
        registrationCloseAt: new Date(now + 3_600_000).toISOString(),
        startTime: new Date(now + 3_600_000).toISOString(),
        ticketPrice: 10,
        maxPlayers: 10,
        maxTicketsPerPlayer: 5,
        minPlayers: 1,
        callIntervalSeconds: 3,
        callMode: "MANUAL",
        winningPatternId: patterns[0].id,
        prizeRuleId: rules[0].id,
      },
    });
    const { game } = (await createRes.json()).data;
    createdGameIds.push(game.id);

    const firstCancel = await apiFetch(`/api/admin/games/${game.id}/cancel`, {
      method: "POST",
      cookie: superAdminCookie,
      body: { reason: "First cancellation." },
    });
    expect(firstCancel.status).toBe(200);

    const secondCancel = await apiFetch(`/api/admin/games/${game.id}/cancel`, {
      method: "POST",
      cookie: superAdminCookie,
      body: { reason: "Retried cancellation." },
    });
    expect(secondCancel.status).toBe(409);
    const secondCancelBody = await secondCancel.json();
    expect(secondCancelBody.error.code).not.toBe("INTERNAL_ERROR");
  });

  it("a malformed or missing JSON request body returns a clean 400, not a 500", async () => {
    // req.json() throws a bare SyntaxError here — a client mistake, not a
    // server fault. Bypasses the apiFetch helper (which always JSON.stringifies
    // opts.body) to send a genuinely unparseable body.
    const malformed = await fetch(`${BASE_URL}/api/tickets/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: playerACookie },
      body: "{not valid json",
    });
    expect(malformed.status).toBe(400);
    const malformedBody = await malformed.json();
    expect(malformedBody.error.code).not.toBe("INTERNAL_ERROR");

    const empty = await fetch(`${BASE_URL}/api/tickets/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: playerACookie },
    });
    expect(empty.status).toBe(400);
    const emptyBody = await empty.json();
    expect(emptyBody.error.code).not.toBe("INTERNAL_ERROR");
  });
});
