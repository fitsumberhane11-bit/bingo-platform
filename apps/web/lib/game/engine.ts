import { Prisma, prisma, type Game, type GameStatus as PrismaGameStatus } from "@bingo/db";
import {
  assertValidTransition,
  commitmentHash,
  deriveCallSequence,
  generateSecretSeed,
  letterForBall,
  InvalidGameTransitionError,
  type GameStatus,
} from "@bingo/game-core";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { encryptSecret, decryptSecret } from "../crypto";
import { writeAuditLog } from "../audit";
import { notifyUser } from "../notifications";
import { applyWalletTransaction } from "../wallet-service";
import { getGameBroadcaster } from "./broadcaster";
import { applyPlatformLedgerEntry } from "./platform-ledger";
import { postGameAnnouncement } from "./announcements";

// Overridable so integration tests don't have to burn real seconds per
// game-start assertion; production always uses the 29s default.
const STARTING_COUNTDOWN_SECONDS = Number(process.env.GAME_STARTING_COUNTDOWN_SECONDS ?? 29);

// Short, human-typeable per-game reference code — see the schema comment
// on Game.gameCode. Alphabet excludes 0/O/1/I/L so a code read aloud or
// copied by hand is never ambiguous.
const GAME_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const GAME_CODE_LENGTH = 6;

function randomGameCode(): string {
  let code = "";
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    code += GAME_CODE_ALPHABET[Math.floor(Math.random() * GAME_CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueGameCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomGameCode();
    const existing = await prisma.game.findUnique({ where: { gameCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique game code after 10 attempts.");
}

export interface CreateGameInput {
  name: string;
  description?: string;
  gameDate: Date;
  startTime: Date;
  registrationOpenAt: Date;
  registrationCloseAt: Date;
  ticketPrice: number;
  maxPlayers: number;
  maxTicketsPerPlayer: number;
  minPlayers: number;
  jackpotAmount?: number;
  callIntervalSeconds: number;
  callMode: "AUTO" | "MANUAL";
  manualMarkEnabled?: boolean;
  winningPatternId: string;
  prizeRuleId: string;
  /** Operator-authoritative prize amount (Section 2) — when set, this is the ONE true prize, never derived from ticket sales. */
  operatorPrizeAmount?: number;
  /** Configurable false-Bingo policy (Section 16). Defaults to warn(1)/disqualify-card(2)/remove-player(3) if omitted. */
  falseBingoPolicy?: { warnAt?: number; disqualifyCardAt?: number; removePlayerAt?: number };
}

export async function createGame(input: CreateGameInput, actorId: string): Promise<Game> {
  if (input.registrationOpenAt >= input.registrationCloseAt) {
    throw new ValidationError("Registration must open before it closes.");
  }
  if (input.registrationCloseAt > input.startTime) {
    throw new ValidationError("Registration must close at or before the game's start time.");
  }
  if (input.minPlayers > input.maxPlayers) {
    throw new ValidationError("Minimum players cannot exceed maximum players.");
  }
  if (input.operatorPrizeAmount != null && !(input.operatorPrizeAmount > 0)) {
    throw new ValidationError("Prize amount must be a positive number.");
  }

  const seed = generateSecretSeed();
  const gameCode = await generateUniqueGameCode();
  const game = await prisma.game.create({
    data: {
      name: input.name,
      gameCode,
      description: input.description,
      status: "DRAFT",
      gameDate: input.gameDate,
      startTime: input.startTime,
      registrationOpenAt: input.registrationOpenAt,
      registrationCloseAt: input.registrationCloseAt,
      ticketPrice: input.ticketPrice,
      maxPlayers: input.maxPlayers,
      maxTicketsPerPlayer: input.maxTicketsPerPlayer,
      minPlayers: input.minPlayers,
      jackpotAmount: input.jackpotAmount ?? 0,
      callIntervalSeconds: input.callIntervalSeconds,
      callMode: input.callMode,
      manualMarkEnabled: input.manualMarkEnabled ?? false,
      winningPatternId: input.winningPatternId,
      prizeRuleId: input.prizeRuleId,
      operatorPrizeAmount: input.operatorPrizeAmount,
      falseBingoPolicy: input.falseBingoPolicy ?? undefined,
      seedCommitmentHash: commitmentHash(seed),
      secretSeedEncrypted: encryptSecret(seed),
      createdByUserId: actorId,
    },
  });

  await prisma.gameEvent.create({ data: { gameId: game.id, type: "CREATED", payload: { createdBy: actorId } } });
  await writeAuditLog({ actorUserId: actorId, action: "GAME_CREATED", entityType: "Game", entityId: game.id, newValue: { name: game.name } });

  return game;
}

/**
 * Every admin/operator-triggered status change goes through here. The
 * actual DB write is a conditional `updateMany` guarded by the *current*
 * status — the same exactly-once-transition pattern used for Payment and
 * Wallet — so two operators racing to start/cancel/pause the same game can
 * never both succeed, and the game-core state machine's transition table
 * (not ad-hoc per-route logic) is the single source of truth for what's
 * legal.
 */
async function transitionGame(
  gameId: string,
  actorId: string | null,
  to: GameStatus,
  extra?: { cancelReason?: string; auditAction?: string },
): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new NotFoundError("Game not found.");

  try {
    assertValidTransition(game.status as GameStatus, to);
  } catch (err) {
    if (err instanceof InvalidGameTransitionError) {
      // game-core is deliberately framework-agnostic and knows nothing about
      // HTTP — translate its error into the app's typed error hierarchy here
      // so it maps to a proper 409 instead of falling through
      // withApiHandler's catch-all to a raw, misleading 500. Found via the
      // final acceptance demo's duplicate-cancel failure-mode check, not by
      // any unit test — those call transitionGame() directly and only
      // assert `.rejects.toThrow()`, which passes regardless of error type.
      throw new ConflictError(err.message);
    }
    throw err;
  }

  const data: Prisma.GameUpdateInput = { status: to };
  if (to === "LIVE" && !game.startedAt) data.startedAt = new Date();
  if (to === "PAUSED") data.pausedAt = new Date();
  if (to === "COMPLETED") data.completedAt = new Date();
  if (to === "CANCELLED") {
    data.cancelledAt = new Date();
    data.cancelReason = extra?.cancelReason ?? "No reason provided.";
  }

  const updateResult = await prisma.game.updateMany({ where: { id: gameId, status: game.status }, data });
  if (updateResult.count === 0) {
    throw new ConflictError(`Game status changed concurrently — refresh and try again (expected ${game.status}).`);
  }

  const updated = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });

  await prisma.gameEvent.create({
    data: { gameId, type: mapStatusToEventType(to), payload: { from: game.status, to, actorId } },
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: extra?.auditAction ?? `GAME_${to}`,
    entityType: "Game",
    entityId: gameId,
    oldValue: { status: game.status },
    newValue: { status: to },
  });

  getGameBroadcaster().publish(gameId, "game:status", { status: to, at: new Date().toISOString() });
  // Also fanned out on the platform-wide "global" channel — this is what
  // lets the lobby (/play) and dashboard live-update the moment a game
  // opens for registration, without the player needing to refresh. See
  // components/live/LiveRefresh.tsx.
  getGameBroadcaster().publish("global", "game:lobby-update", { gameId, status: to });

  return updated;
}

function mapStatusToEventType(status: GameStatus) {
  const map: Record<GameStatus, string> = {
    DRAFT: "UPDATED",
    SCHEDULED: "UPDATED",
    OPEN: "OPENED",
    FULL: "UPDATED",
    STARTING: "STARTING",
    LIVE: "STARTED",
    PAUSED: "PAUSED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
  };
  return map[status] as never;
}

export async function scheduleGame(gameId: string, actorId: string) {
  return transitionGame(gameId, actorId, "SCHEDULED");
}

export async function openGame(gameId: string, actorId: string) {
  return transitionGame(gameId, actorId, "OPEN");
}

/** Begins the countdown. A separate timer (see below) flips STARTING -> LIVE after the countdown elapses. */
export async function startGame(gameId: string, actorId: string): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new NotFoundError("Game not found.");

  const playerCount = await prisma.gamePlayer.count({ where: { gameId } });
  if (playerCount < game.minPlayers) {
    throw new ConflictError(`At least ${game.minPlayers} players are required to start (currently ${playerCount}).`);
  }

  const updated = await transitionGame(gameId, actorId, "STARTING");
  getGameBroadcaster().publish(gameId, "game:countdown", { seconds: STARTING_COUNTDOWN_SECONDS });
  await postGameAnnouncement({
    gameId,
    type: "IMPORTANT",
    createdByUserId: actorId,
    message: `⏱️ Game is starting in ${STARTING_COUNTDOWN_SECONDS} seconds — get ready!`,
    // Stops showing itself the moment the countdown ends (LIVE) — it has
    // nothing left to say once the game has actually started, and would
    // otherwise sit in the announcements list indefinitely.
    expiresAt: new Date(Date.now() + STARTING_COUNTDOWN_SECONDS * 1000),
  });

  scheduleCountdownToLive(gameId);
  return updated;
}

const countdownTimers = getGlobalMap<NodeJS.Timeout>("__gameCountdownTimers");
const autoCallTimers = getGlobalMap<NodeJS.Timeout>("__gameAutoCallTimers");

function getGlobalMap<T>(key: string): Map<string, T> {
  const g = globalThis as unknown as Record<string, Map<string, T> | undefined>;
  if (!g[key]) g[key] = new Map();
  return g[key]!;
}

function scheduleCountdownToLive(gameId: string) {
  clearTimer(countdownTimers, gameId);
  const timer = setTimeout(async () => {
    countdownTimers.delete(gameId);
    try {
      const game = await prisma.game.findUnique({ where: { id: gameId } });
      if (!game || game.status !== "STARTING") return; // cancelled during countdown
      await transitionGame(gameId, null, "LIVE", { auditAction: "GAME_STARTED" });
      if (game.callMode === "AUTO") startAutoCaller(gameId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to auto-transition game ${gameId} from STARTING to LIVE:`, err);
    }
  }, STARTING_COUNTDOWN_SECONDS * 1000);
  countdownTimers.set(gameId, timer);
}

function clearTimer(map: Map<string, NodeJS.Timeout>, gameId: string) {
  const existing = map.get(gameId);
  if (existing) {
    clearTimeout(existing);
    clearInterval(existing);
    map.delete(gameId);
  }
}

export function startAutoCaller(gameId: string) {
  clearTimer(autoCallTimers, gameId);
  prisma.game.findUnique({ where: { id: gameId } }).then((game) => {
    if (!game || game.status !== "LIVE") return;
    const timer = setInterval(async () => {
      try {
        const current = await prisma.game.findUnique({ where: { id: gameId } });
        if (!current || current.status !== "LIVE") {
          stopAutoCaller(gameId);
          return;
        }
        await callNextNumber(gameId, null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Auto-caller error for game ${gameId}:`, err);
      }
    }, game.callIntervalSeconds * 1000);
    autoCallTimers.set(gameId, timer);
  });
}

export function stopAutoCaller(gameId: string) {
  clearTimer(autoCallTimers, gameId);
}

/**
 * Self-healing recovery for the one piece of game state that genuinely
 * lives only in process memory: the AUTO-mode calling interval (everything
 * else — status, calledCount, called numbers, winners — is read fresh from
 * Postgres on every request, so a realtime-process restart can't corrupt
 * or lose it). If this process has no timer registered for a LIVE AUTO
 * game, one is started; if it already does, this is a no-op. Called from
 * the SSE stream route on every connect/reconnect, which is what makes a
 * genuine process restart self-heal the very next time any player (or an
 * admin's operator console) reconnects — no separate boot script needed.
 */
export function ensureAutoCallerRunning(gameId: string, status: string, callMode: string): void {
  if (status !== "LIVE" || callMode !== "AUTO") return;
  if (autoCallTimers.has(gameId)) return;
  startAutoCaller(gameId);
}

/**
 * Same self-healing idea as ensureAutoCallerRunning, for the other timer
 * that only lives in process memory: the STARTING -> LIVE countdown. There
 * is no persisted "countdown began at" timestamp to resume from (schema
 * has startedAt for LIVE, pausedAt for PAUSED, but nothing for STARTING),
 * so a genuinely orphaned STARTING game — the process that called
 * startGame() exited before its countdown fired, e.g. a server restart —
 * gets a fresh full countdown on the next connect rather than being stuck
 * in STARTING forever with no path to LIVE. Restarting the countdown from
 * the top costs a few extra seconds at most; getting permanently stuck
 * costs the whole game.
 */
export function ensureCountdownRunning(gameId: string, status: string): void {
  if (status !== "STARTING") return;
  if (countdownTimers.has(gameId)) return;
  getGameBroadcaster().publish(gameId, "game:countdown", { seconds: STARTING_COUNTDOWN_SECONDS });
  scheduleCountdownToLive(gameId);
}

export async function pauseGame(gameId: string, actorId: string): Promise<Game> {
  stopAutoCaller(gameId);
  return transitionGame(gameId, actorId, "PAUSED");
}

export async function resumeGame(gameId: string, actorId: string): Promise<Game> {
  const game = await transitionGame(gameId, actorId, "LIVE", { auditAction: "GAME_RESUMED" });
  if (game.callMode === "AUTO") startAutoCaller(gameId);
  return game;
}

/**
 * Releases the platform account's liability for a refunded ticket — the
 * counterpart to the PRIZE_POOL_CONTRIBUTION + PLATFORM_FEE_REVENUE entries
 * recorded at purchase time (see tickets.ts). One combined REFUND entry for
 * the full ticket price, since from the platform account's perspective the
 * money simply leaves custody and goes back to the player — the earlier
 * fee/pool split doesn't need to be reversed component-by-component.
 */
async function refundTicketPlatformLedger(gameId: string, ticketId: string, amount: Prisma.Decimal): Promise<void> {
  await applyPlatformLedgerEntry({
    type: "REFUND",
    amount,
    referenceId: `platform-refund:${ticketId}`,
    relatedGameId: gameId,
    relatedTicketId: ticketId,
  });
}

/**
 * Refund policy — deliberately NOT symmetric between the two cases:
 *
 *  - Pre-LIVE cancellation (DRAFT/SCHEDULED/OPEN/FULL/STARTING): the game
 *    never actually ran. A full, automatic refund of every active ticket is
 *    the only defensible outcome, so it happens unconditionally here.
 *  - LIVE/PAUSED cancellation ("emergency"): players may have already had
 *    numbers called, formed expectations, or (rarely) already won. What a
 *    fair refund looks like at that point — full refund, none, or something
 *    proportional — is a business/legal policy decision, not an engineering
 *    one. Rather than invent a rule, this path issues NO automatic refund;
 *    it records an explicit, high-visibility audit entry and notifies
 *    affected players that the cancellation is pending manual Finance
 *    review. See docs/STATUS.md for the documented policy and its rationale.
 */
export async function cancelGame(gameId: string, actorId: string, reason: string): Promise<Game> {
  const before = await prisma.game.findUnique({ where: { id: gameId } });
  if (!before) throw new NotFoundError("Game not found.");
  const isEmergency = before.status === "LIVE" || before.status === "PAUSED";

  stopAutoCaller(gameId);
  const game = await transitionGame(gameId, actorId, "CANCELLED", {
    cancelReason: reason,
    auditAction: isEmergency ? "GAME_EMERGENCY_CANCELLED" : "GAME_CANCELLED",
  });

  const tickets = await prisma.bingoTicket.findMany({ where: { gameId, status: "ACTIVE" } });

  if (isEmergency) {
    if (tickets.length > 0) {
      await writeAuditLog({
        actorUserId: actorId,
        action: "GAME_CANCELLED_LIVE_REQUIRES_MANUAL_REFUND_REVIEW",
        entityType: "Game",
        entityId: gameId,
        newValue: { reason, affectedTicketCount: tickets.length, affectedUserIds: [...new Set(tickets.map((t) => t.userId))] },
      });
    }
    for (const ticket of tickets) {
      await notifyUser({
        userId: ticket.userId,
        type: "GAME_CANCELLED",
        title: "Game cancelled",
        body: `"${game.name}" was cancelled while in progress. Our Finance team will review your ticket #${ticket.ticketNumber} for a refund shortly — no action is needed from you.`,
      });
    }
    return game;
  }

  // Refund every active ticket exactly once — `applyWalletTransaction`'s
  // `referenceId` idempotency means calling this twice (e.g. a retried
  // request) can never double-refund the same ticket.
  for (const ticket of tickets) {
    const walletTx = await applyWalletTransaction({
      userId: ticket.userId,
      type: "REFUND",
      direction: "CREDIT",
      amount: ticket.purchasePrice.toString(),
      referenceId: `game-cancel-refund:${ticket.id}`,
      relatedGameId: gameId,
      relatedTicketId: ticket.id,
      metadata: { reason },
    });
    await refundTicketPlatformLedger(gameId, ticket.id, ticket.purchasePrice);
    await prisma.bingoTicket.updateMany({ where: { id: ticket.id, status: "ACTIVE" }, data: { status: "REFUNDED" } });
    await notifyUser({
      userId: ticket.userId,
      type: "GAME_CANCELLED",
      title: "Game cancelled — refunded",
      body: `"${game.name}" was cancelled. Your ETB ${ticket.purchasePrice.toString()} for ticket #${ticket.ticketNumber} has been refunded.`,
      metadata: { walletTransactionId: walletTx.id },
    });
  }

  return game;
}

/**
 * The one place in the entire system that decides which ball comes next —
 * and it decides by looking up a position in a sequence that was fully
 * determined and committed to (via its SHA-256 hash) before the game ever
 * went LIVE. A GAME_OPERATOR calling this endpoint controls *when*; they
 * supply no input that influences *which number*.
 *
 * Deliberately does NOT sweep for or declare winners — that used to happen
 * synchronously right here, which is exactly what made the game "play
 * itself." Winner detection is now entirely player-initiated: a player who
 * believes they've won submits a claim (see claims.ts's submitBingoClaim),
 * which the server validates against the same authoritative called-numbers
 * data this function produces. This function's only job is calling numbers.
 */
export async function callNextNumber(gameId: string, actorId: string | null): Promise<{ ballNumber: number; letter: string; sequenceNumber: number } | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundError("Game not found.");
    if (game.status !== "LIVE") throw new ConflictError(`Cannot call a number while the game is ${game.status}.`);
    if (game.calledCount >= 75) {
      await completeGame(gameId, actorId, "All 75 numbers have been called with no winner.");
      return null;
    }

    const updateResult = await prisma.game.updateMany({
      where: { id: gameId, calledCount: game.calledCount, status: "LIVE" },
      data: { calledCount: { increment: 1 } },
    });
    if (updateResult.count === 0) continue; // lost the race — retry against fresh state

    const newSequenceNumber = game.calledCount + 1;
    if (!game.secretSeedEncrypted) throw new Error(`Game ${gameId} has no committed seed — data integrity error.`);
    const seed = decryptSecret(game.secretSeedEncrypted);
    const fullSequence = deriveCallSequence(seed);
    const ballNumber = fullSequence[newSequenceNumber - 1]!;
    const letter = letterForBall(ballNumber);

    await prisma.bingoNumber.create({
      data: { gameId, ballNumber, letter, sequenceNumber: newSequenceNumber },
    });
    await prisma.gameEvent.create({
      data: { gameId, type: "NUMBER_CALLED", payload: { ballNumber, letter, sequenceNumber: newSequenceNumber, actorId } },
    });

    getGameBroadcaster().publish(gameId, "game:number-called", { ballNumber, letter, sequenceNumber: newSequenceNumber });

    return { ballNumber, letter, sequenceNumber: newSequenceNumber };
  }

  throw new Error(`callNextNumber for game ${gameId} failed after multiple concurrent-modification retries.`);
}

/**
 * Explicit operator "End Game" action (Section 26) — distinct from the
 * automatic forfeit-completion above (all 75 called, no winner). Lets an
 * operator end a LIVE/PAUSED game early for any reason (e.g. all configured
 * prize stages are already won, or a real-world need to stop the session).
 */
export async function endGame(gameId: string, actorId: string, reason?: string): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new NotFoundError("Game not found.");
  if (game.status !== "LIVE" && game.status !== "PAUSED") {
    throw new ConflictError(`Cannot end a game that is ${game.status}.`);
  }
  return completeGame(gameId, actorId, reason ?? "Ended by operator.");
}

export async function completeGame(gameId: string, actorId: string | null, note?: string): Promise<Game> {
  stopAutoCaller(gameId);
  clearTimer(countdownTimers, gameId);

  const before = await prisma.game.findUnique({ where: { id: gameId } });
  if (!before) throw new NotFoundError("Game not found.");
  if (before.status === "COMPLETED") return before; // already completed (e.g. by a concurrent winner-detection call)

  const game = await transitionGame(gameId, actorId, "COMPLETED", { auditAction: "GAME_COMPLETED" });

  if (game.secretSeedEncrypted && !game.seedRevealedAt) {
    const seed = decryptSecret(game.secretSeedEncrypted);
    await prisma.game.update({ where: { id: gameId }, data: { seedRevealedAt: new Date() } });
    await prisma.gameEvent.create({ data: { gameId, type: "SEED_REVEALED", payload: { seed, note } } });
  }

  getGameBroadcaster().publish(gameId, "game:completed", { note });
  return game;
}
