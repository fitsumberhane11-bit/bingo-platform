import { Prisma, prisma, type BingoClaim, type BingoTicket, type Game, type PrizeRule } from "@bingo/db";
import { evaluatePattern, resolveWinnerSet, splitByStake, splitEqually, type BingoCard } from "@bingo/game-core";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { writeAuditLog } from "../audit";
import { notifyUser } from "../notifications";
import { getGameBroadcaster } from "./broadcaster";
import { payWinner } from "./payout";
import { toPatternDefinition } from "./pattern-resolver";
import { resolveGamePrizePool } from "./prize-authority";
import { completeGame } from "./engine";
import { postGameAnnouncement } from "./announcements";

/** A claim loaded with its full ticket (and the ticket's owning user's username) — the shape every confirm/reject helper below operates on. */
type ClaimWithTicket = BingoClaim & { ticket: BingoTicket & { user: { username: string } } };

interface FalseBingoPolicy {
  warnAt?: number;
  disqualifyCardAt?: number;
  removePlayerAt?: number;
}

/** Conservative default (Section 16): warn once, disqualify the card on the 2nd false claim, remove the player from the game on the 3rd. */
const DEFAULT_FALSE_BINGO_POLICY: FalseBingoPolicy = { warnAt: 1, disqualifyCardAt: 2, removePlayerAt: 3 };

export interface SubmitClaimResult {
  claim: BingoClaim;
  won: boolean;
  penalty: "NONE" | "WARNING" | "CARD_DISQUALIFIED" | "PLAYER_REMOVED";
}

/**
 * The core of turning winner declaration from an automatic server sweep
 * into a genuinely player-initiated action (Section 13-21). The server
 * independently recomputes whether this SPECIFIC card satisfies the claimed
 * pattern from authoritative data (calledNumbers + the ticket's actual
 * numbers) — nothing about the result is ever taken from the client, which
 * supplies only gameId/ticketId/stageId. A VALID claim still waits for an
 * operator to confirm it (see confirmBingoClaim) before anything is paid;
 * an INVALID claim is auto-resolved immediately and may trigger the game's
 * configured false-Bingo penalty policy.
 */
export async function submitBingoClaim(input: { gameId: string; ticketId: string; userId: string; stageId?: string }): Promise<SubmitClaimResult> {
  const game = await prisma.game.findUnique({ where: { id: input.gameId } });
  if (!game) throw new NotFoundError("Game not found.");
  if (game.status !== "LIVE" && game.status !== "PAUSED") {
    throw new ConflictError(`Cannot submit a Bingo claim while the game is ${game.status}.`);
  }

  const ticket = await prisma.bingoTicket.findUnique({ where: { id: input.ticketId }, include: { user: { select: { username: true } } } });
  if (!ticket || ticket.gameId !== input.gameId) throw new NotFoundError("Ticket not found in this game.");
  if (ticket.userId !== input.userId) throw new ForbiddenError("This card does not belong to you.");
  if (ticket.status === "DISQUALIFIED") throw new ConflictError("This card has been disqualified and can no longer win.");
  if (ticket.status === "WINNER") throw new ConflictError("This card has already won.");
  if (ticket.status !== "ACTIVE") throw new ConflictError(`This card is ${ticket.status.toLowerCase()} and cannot claim a win.`);

  let stage = null as Awaited<ReturnType<typeof prisma.winningStage.findUnique>>;
  let patternId = game.winningPatternId;
  if (input.stageId) {
    stage = await prisma.winningStage.findUnique({ where: { id: input.stageId } });
    if (!stage || stage.gameId !== input.gameId) throw new NotFoundError("Winning stage not found for this game.");
    if (stage.status === "COMPLETED") {
      throw new ConflictError(`"${stage.label ?? "This prize stage"}" has already been fully claimed.`);
    }
    patternId = stage.patternId;
  }

  // One outstanding (not-yet-resolved) claim per ticket+pattern at a time —
  // stops a player spamming BINGO repeatedly for the same stage.
  const existingPending = await prisma.bingoClaim.findFirst({
    where: { ticketId: ticket.id, patternId, confirmationStatus: "PENDING" },
  });
  if (existingPending) throw new ConflictError("This card already has a claim awaiting operator review.");

  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { id: patternId } });
  const patternDef = toPatternDefinition(pattern);

  const calledNumbers = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, orderBy: { sequenceNumber: "asc" } });
  const calledSet = new Set(calledNumbers.map((n) => n.ballNumber));
  const card = ticket.cardNumbers as unknown as BingoCard;
  const evaluation = evaluatePattern(card, calledSet, patternDef);
  const latestCall = calledNumbers[calledNumbers.length - 1];

  if (!evaluation.won) {
    const claim = await prisma.bingoClaim.create({
      data: {
        gameId: game.id,
        ticketId: ticket.id,
        userId: ticket.userId,
        stageId: stage?.id,
        patternId,
        validationStatus: "INVALID",
        invalidReason: `Card does not currently satisfy "${pattern.name}".`,
        confirmationStatus: "REJECTED", // no operator action needed for a system-rejected claim
        confirmedAt: new Date(),
        ballNumberAtWin: latestCall?.ballNumber,
        calledSequenceNumber: latestCall?.sequenceNumber,
      },
    });

    await prisma.gameEvent.create({
      data: { gameId: game.id, type: "BINGO_CLAIM_INVALID", payload: { ticketId: ticket.id, userId: ticket.userId, patternId, claimId: claim.id } },
    });
    getGameBroadcaster().publish(game.id, "game:claim", {
      claimId: claim.id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      userId: ticket.userId,
      pattern: pattern.name,
      result: "INVALID",
    });

    const penalty = await applyFalseBingoPolicy(game, ticket);
    return { claim, won: false, penalty };
  }

  const claim = await prisma.bingoClaim.create({
    data: {
      gameId: game.id,
      ticketId: ticket.id,
      userId: ticket.userId,
      stageId: stage?.id,
      patternId,
      validationStatus: "VALID",
      confirmationStatus: "PENDING",
      ballNumberAtWin: latestCall?.ballNumber,
      calledSequenceNumber: latestCall?.sequenceNumber,
    },
  });

  await prisma.gameEvent.create({
    data: { gameId: game.id, type: "BINGO_CLAIM_SUBMITTED", payload: { ticketId: ticket.id, userId: ticket.userId, patternId, claimId: claim.id } },
  });
  getGameBroadcaster().publish(game.id, "game:claim", {
    claimId: claim.id,
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    userId: ticket.userId,
    username: ticket.user.username,
    pattern: pattern.name,
    // The card itself, so every player — not just the claimant — can
    // visually cross-check it against the called numbers while the
    // operator reviews it manually (transparency).
    cardNumbers: ticket.cardNumbers,
    result: "PENDING_REVIEW",
  });

  return { claim, won: true, penalty: "NONE" };
}

/** Applies the game's configured false-Bingo policy after an INVALID claim. Conservative default if the operator didn't configure one. */
async function applyFalseBingoPolicy(
  game: Game,
  ticket: { id: string; userId: string; ticketNumber: number },
): Promise<SubmitClaimResult["penalty"]> {
  const policy = (game.falseBingoPolicy as FalseBingoPolicy | null) ?? DEFAULT_FALSE_BINGO_POLICY;

  // Per-ticket counter, kept for the card's own audit trail...
  await prisma.bingoTicket.update({
    where: { id: ticket.id },
    data: { falseClaimCount: { increment: 1 } },
  });
  // ...but the escalation policy itself is counted per PLAYER across the
  // whole game (Section 16's own example: "1st false Bingo: Warning, 2nd:
  // card disqualified, 3rd: player removed" reads as one running count for
  // the player, not per-card — a card that gets disqualified on its own
  // 2nd false claim could otherwise never reach a "3rd" on itself).
  const count = await prisma.bingoClaim.count({ where: { gameId: game.id, userId: ticket.userId, validationStatus: "INVALID" } });

  if (policy.removePlayerAt && count >= policy.removePlayerAt) {
    const activeTickets = await prisma.bingoTicket.findMany({ where: { gameId: game.id, userId: ticket.userId, status: "ACTIVE" } });
    for (const t of activeTickets) {
      await prisma.bingoTicket.update({
        where: { id: t.id },
        data: { status: "DISQUALIFIED", disqualifiedAt: new Date(), disqualifiedReason: `Player removed after ${count} false Bingo claims.` },
      });
    }
    await prisma.gameEvent.create({
      data: { gameId: game.id, type: "PLAYER_REMOVED_FROM_GAME", payload: { userId: ticket.userId, falseClaimCount: count } },
    });
    await notifyUser({
      userId: ticket.userId,
      type: "PLAYER_REMOVED_FROM_GAME",
      title: "Removed from game",
      body: `You've been removed from "${game.name}" after ${count} false Bingo claims. All your cards in this game are disqualified.`,
    });
    const removedUser = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { username: true } });
    const blockedCount = await prisma.bingoTicket.count({ where: { gameId: game.id, status: "DISQUALIFIED" } });
    await postGameAnnouncement({
      gameId: game.id,
      type: "WARNING",
      createdByUserId: game.createdByUserId,
      message: `🚫 ${removedUser?.username ?? "A player"} was removed from the game after repeated false Bingo claims — all their cards are disqualified. (${blockedCount} card${blockedCount === 1 ? "" : "s"} blocked so far.)`,
    });
    return "PLAYER_REMOVED";
  }

  if (policy.disqualifyCardAt && count >= policy.disqualifyCardAt) {
    await prisma.bingoTicket.update({
      where: { id: ticket.id },
      data: { status: "DISQUALIFIED", disqualifiedAt: new Date(), disqualifiedReason: `Disqualified after ${count} false Bingo claims on this card.` },
    });
    await prisma.gameEvent.create({
      data: { gameId: game.id, type: "CARD_DISQUALIFIED", payload: { ticketId: ticket.id, userId: ticket.userId, falseClaimCount: count } },
    });
    getGameBroadcaster().publish(game.id, "game:card-disqualified", { ticketId: ticket.id, userId: ticket.userId });
    await notifyUser({
      userId: ticket.userId,
      type: "CARD_DISQUALIFIED",
      title: "Card disqualified",
      body: `Your card has been disqualified in "${game.name}" after ${count} false Bingo claims. Your other cards, if any, are still in play.`,
    });
    await announceCardDisqualified(game.id, game.createdByUserId, ticket.userId, ticket.ticketNumber);
    return "CARD_DISQUALIFIED";
  }

  if (policy.warnAt && count >= policy.warnAt) {
    await notifyUser({
      userId: ticket.userId,
      type: "FALSE_BINGO_WARNING",
      title: "That wasn't a Bingo",
      body: `Your card didn't satisfy the winning pattern. This is warning ${count} — repeated false claims can disqualify a card.`,
    });
    return "WARNING";
  }

  return "NONE";
}

/** Public, room-wide callout for a blocked card — same announcement channel a confirmed winner uses, so every player (not just the one whose card it was) sees false-Bingo enforcement happening, and how many cards have been blocked so far this game. */
async function announceCardDisqualified(gameId: string, actorId: string, userId: string, ticketNumber: number) {
  const [user, blockedCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    prisma.bingoTicket.count({ where: { gameId, status: "DISQUALIFIED" } }),
  ]);
  await postGameAnnouncement({
    gameId,
    type: "WARNING",
    createdByUserId: actorId,
    message: `🚫 ${user?.username ?? "A player"}'s Card #${ticketNumber} was disqualified — false Bingo. (${blockedCount} card${blockedCount === 1 ? "" : "s"} blocked so far.)`,
  });
}

/**
 * Operator-initiated disqualification — separate from the automatic
 * false-Bingo policy escalation in applyFalseBingoPolicy above. That policy
 * only acts on the player's running false-claim count reaching a
 * configured threshold; this lets an operator disqualify a specific card
 * immediately after seeing a false claim (or any other reason — suspected
 * collusion, a support request, etc.), without waiting for the count to
 * catch up. Mirrors the same mechanics (status, event, notification,
 * broadcast) so both paths look identical to players and to anything else
 * watching the game.
 */
export async function disqualifyTicket(ticketId: string, actorId: string, reason: string): Promise<BingoTicket> {
  const ticket = await prisma.bingoTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Card not found.");
  if (ticket.status === "DISQUALIFIED") throw new ConflictError("This card is already disqualified.");

  const updated = await prisma.bingoTicket.update({
    where: { id: ticketId },
    data: { status: "DISQUALIFIED", disqualifiedAt: new Date(), disqualifiedReason: reason },
  });

  await prisma.gameEvent.create({
    data: { gameId: ticket.gameId, type: "CARD_DISQUALIFIED", payload: { ticketId, userId: ticket.userId, reason, actorId, manual: true } },
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: "CARD_DISQUALIFIED_MANUAL",
    entityType: "BingoTicket",
    entityId: ticketId,
    newValue: { reason },
  });
  getGameBroadcaster().publish(ticket.gameId, "game:card-disqualified", { ticketId, userId: ticket.userId });
  await notifyUser({
    userId: ticket.userId,
    type: "CARD_DISQUALIFIED",
    title: "Card disqualified",
    body: `Your card (#${ticket.ticketNumber}) was disqualified by the operator: ${reason}`,
  });
  await announceCardDisqualified(ticket.gameId, actorId, ticket.userId, ticket.ticketNumber);

  return updated;
}

export interface ConfirmClaimResult {
  confirmed: BingoClaim[];
  rejected: BingoClaim[];
}

/**
 * Operator confirms a VALID, PENDING claim (Section 20) — this is the one
 * moment a prize actually pays out. For a staged game, only this one claim
 * is resolved, gated by an atomic conditional increment of the stage's
 * winnerCount so two operators (or two simultaneous confirms) can never
 * both fill the last slot (Section 21). For a legacy single-pattern game,
 * every other still-PENDING VALID claim for the same pattern is resolved in
 * the same action — this preserves the platform's original "simultaneous
 * winners share the pool" behavior, just triggered by an operator's confirm
 * click instead of an automatic sweep.
 */
export async function confirmBingoClaim(claimId: string, actorId: string): Promise<ConfirmClaimResult> {
  const claim = await prisma.bingoClaim.findUnique({ where: { id: claimId }, include: { ticket: { include: { user: { select: { username: true } } } } } });
  if (!claim) throw new NotFoundError("Claim not found.");
  if (claim.validationStatus !== "VALID" || claim.confirmationStatus !== "PENDING") {
    throw new ConflictError("Only a valid, pending claim can be confirmed.");
  }

  const game = await prisma.game.findUniqueOrThrow({ where: { id: claim.gameId }, include: { prizeRule: true, winningPattern: true } });

  if (claim.stageId) {
    return confirmStagedClaim(game, claim, actorId);
  }
  return confirmLegacyClaims(game, claim, actorId);
}

async function confirmStagedClaim(
  game: Game & { prizeRule: PrizeRule },
  claim: ClaimWithTicket,
  actorId: string,
): Promise<ConfirmClaimResult> {
  const stage = await prisma.winningStage.findUniqueOrThrow({ where: { id: claim.stageId! } });

  const reserved = await prisma.winningStage.updateMany({
    where: { id: stage.id, winnerCount: { lt: stage.winnerLimit } },
    data: { winnerCount: { increment: 1 } },
  });

  if (reserved.count === 0) {
    const rejected = await rejectClaimInternal(claim.id, actorId, `"${stage.label ?? "This prize stage"}" was already fully claimed by another card first.`);
    return { confirmed: [], rejected: [rejected] };
  }

  const updatedStage = await prisma.winningStage.findUniqueOrThrow({ where: { id: stage.id } });
  if (updatedStage.winnerCount >= updatedStage.winnerLimit) {
    await prisma.winningStage.update({ where: { id: stage.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  }

  const winner = await recordWinnerFromClaim(game, claim, stage.prizeAmount, actorId);

  const remainingStages = await prisma.winningStage.count({ where: { gameId: game.id, status: "ACTIVE" } });
  if (remainingStages === 0) {
    await completeGame(game.id, actorId, "All configured prize stages have been won.");
  }

  return { confirmed: [winner.claim], rejected: [] };
}

async function confirmLegacyClaims(
  game: Game & { prizeRule: PrizeRule },
  claim: ClaimWithTicket,
  actorId: string,
): Promise<ConfirmClaimResult> {
  const siblings = await prisma.bingoClaim.findMany({
    where: { gameId: game.id, patternId: claim.patternId, stageId: null, validationStatus: "VALID", confirmationStatus: "PENDING" },
    include: { ticket: { include: { user: { select: { username: true } } } } },
    orderBy: { submittedAt: "asc" },
  });
  const batch = siblings.length > 0 ? siblings : [claim];

  const resolved = resolveWinnerSet(
    batch.map((c) => ({ ...c, ticketNumber: c.ticket.ticketNumber })),
    game.prizeRule.tieBreakRule,
  );
  const rejectedSiblings = batch.filter((c) => !resolved.some((r) => r.id === c.id));

  const totalPrizePool = await resolveGamePrizePool(game, game.prizeRule);
  const shares =
    game.prizeRule.tieBreakRule === "SHARE_BY_STAKE"
      ? splitByStake(totalPrizePool, resolved.map((c) => ({ purchasePrice: c.ticket.purchasePrice })))
      : splitEqually(totalPrizePool, resolved.length);

  const confirmed = [];
  for (let i = 0; i < resolved.length; i++) {
    const winner = await recordWinnerFromClaim(game, resolved[i]!, shares[i]!, actorId, resolved.length);
    confirmed.push(winner.claim);
  }

  const rejected = [];
  for (const c of rejectedSiblings) {
    rejected.push(await rejectClaimInternal(c.id, actorId, "Another ticket already won this game under the configured tie-break rule."));
  }

  await completeGame(game.id, actorId, `Winner confirmed on claim ${claim.id}.`);

  return { confirmed, rejected };
}

async function recordWinnerFromClaim(
  game: Game & { winningPattern?: { name: string } },
  claim: ClaimWithTicket,
  prizeAmount: Prisma.Decimal,
  actorId: string,
  splitCount = 1,
) {
  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { id: claim.patternId } });

  // Re-derive the exact winning cells for the audit trail. Safe to use the
  // current called-set even though more numbers may have been called since
  // the claim was submitted: every pattern type here is monotonic (calling
  // more numbers can only ever keep a satisfied pattern satisfied), so this
  // still reflects the same win the claim was validated against.
  const calledNumbers = await prisma.bingoNumber.findMany({ where: { gameId: game.id }, select: { ballNumber: true } });
  const calledSet = new Set(calledNumbers.map((n) => n.ballNumber));
  const evaluation = evaluatePattern(claim.ticket.cardNumbers as unknown as BingoCard, calledSet, toPatternDefinition(pattern));

  // Idempotent by claimId: if a prior attempt already created the Winner
  // row but crashed before completing the payout (e.g. lost a database
  // contention race — see feedback_bingo_test_data_hygiene memory for the
  // incident this guards against), a retry must resume from here instead
  // of crashing on the unique-constraint violation that an unconditional
  // create() would hit, which would otherwise strand that payout forever
  // (every retry failing the same way, no path to actually pay the winner).
  const winner =
    (await prisma.winner.findUnique({ where: { claimId: claim.id } })) ??
    (await prisma.winner.create({
      data: {
        gameId: game.id,
        ticketId: claim.ticketId,
        userId: claim.userId,
        winningPatternId: claim.patternId,
        winningStageId: claim.stageId,
        claimId: claim.id,
        ballNumberAtWin: claim.ballNumberAtWin ?? 0,
        calledSequenceNumber: claim.calledSequenceNumber ?? 0,
        winningPositions: evaluation.winningPositions as unknown as Prisma.InputJsonValue,
        prizeAmount,
        splitCount,
      },
    }));

  await prisma.bingoTicket.update({ where: { id: claim.ticketId }, data: { status: "WINNER" } });

  const walletTx = await payWinner({
    userId: claim.userId,
    amount: prizeAmount,
    referenceId: `winner-payout:${winner.id}`,
    relatedGameId: game.id,
    relatedTicketId: claim.ticketId,
    relatedWinnerId: winner.id,
  });
  if (!winner.walletTransactionId) {
    await prisma.winner.update({ where: { id: winner.id }, data: { walletTransactionId: walletTx.id } });
  }

  const confirmedClaim = await prisma.bingoClaim.update({
    where: { id: claim.id },
    data: { confirmationStatus: "CONFIRMED", confirmedByUserId: actorId, confirmedAt: new Date() },
  });

  await prisma.gameEvent.create({
    data: {
      gameId: game.id,
      type: "WINNER_CONFIRMED",
      payload: { ticketId: claim.ticketId, userId: claim.userId, prizeAmount: prizeAmount.toString(), claimId: claim.id, actorId },
    },
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: "WINNER_CONFIRMED",
    entityType: "Winner",
    entityId: winner.id,
    newValue: { gameId: game.id, ticketId: claim.ticketId, pattern: pattern.name, prizeAmount: prizeAmount.toString() },
  });
  await notifyUser({
    userId: claim.userId,
    type: "GAME_WINNER",
    title: "You won! 🎉",
    body: `Congratulations! Your card completed ${pattern.name} in "${game.name}". Prize: ETB ${prizeAmount.toString()}.`,
  });

  getGameBroadcaster().publish(game.id, "game:winner", {
    ticketId: claim.ticketId,
    userId: claim.userId,
    username: claim.ticket.user.username,
    ticketNumber: claim.ticket.ticketNumber,
    // So every player can expand and check the winning card for
    // themselves in the Game Over section, not just read the outcome.
    cardNumbers: claim.ticket.cardNumbers,
    prizeAmount: prizeAmount.toString(),
    winnerCount: splitCount,
    pattern: pattern.name,
    stageId: claim.stageId ?? undefined,
  });

  // A real, persisted announcement — not just the game:winner event above —
  // so every player in the room (not only the winner) sees it called out in
  // the Announcements panel, including anyone who reconnects afterward.
  await postGameAnnouncement({
    gameId: game.id,
    type: "IMPORTANT",
    createdByUserId: actorId,
    message:
      splitCount > 1
        ? `🎉 ${claim.ticket.user.username} won on Card #${claim.ticket.ticketNumber} — ${pattern.name}! Prize: ETB ${prizeAmount.toString()} (split ${splitCount} ways).`
        : `🎉 ${claim.ticket.user.username} won on Card #${claim.ticket.ticketNumber} — ${pattern.name}! Prize: ETB ${prizeAmount.toString()}.`,
  });

  return { winner, claim: confirmedClaim };
}

/** Operator override: rejects a system-VALID claim without paying it (Section 20's [REJECT CLAIM] button — a rare escape hatch, e.g. suspected foul play). Does not affect the ticket's false-claim count; that's reserved for genuine system-INVALID results. */
export async function rejectBingoClaim(claimId: string, actorId: string, reason: string): Promise<BingoClaim> {
  const claim = await prisma.bingoClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw new NotFoundError("Claim not found.");
  if (claim.validationStatus !== "VALID" || claim.confirmationStatus !== "PENDING") {
    throw new ConflictError("Only a valid, pending claim can be rejected.");
  }
  return rejectClaimInternal(claimId, actorId, reason);
}

async function rejectClaimInternal(claimId: string, actorId: string, reason: string): Promise<BingoClaim> {
  const claim = await prisma.bingoClaim.update({
    where: { id: claimId },
    data: { confirmationStatus: "REJECTED", confirmedByUserId: actorId, confirmedAt: new Date() },
  });
  await prisma.gameEvent.create({
    data: { gameId: claim.gameId, type: "WINNER_CLAIM_REJECTED", payload: { claimId, ticketId: claim.ticketId, userId: claim.userId, reason, actorId } },
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: "WINNER_CLAIM_REJECTED",
    entityType: "BingoClaim",
    entityId: claimId,
    newValue: { reason },
  });
  await notifyUser({
    userId: claim.userId,
    type: "BINGO_CLAIM_REJECTED",
    title: "Claim not confirmed",
    body: `Your Bingo claim in this game was reviewed and not confirmed: ${reason}`,
  });
  getGameBroadcaster().publish(claim.gameId, "game:claim", { claimId, ticketId: claim.ticketId, userId: claim.userId, result: "REJECTED", reason });
  return claim;
}
