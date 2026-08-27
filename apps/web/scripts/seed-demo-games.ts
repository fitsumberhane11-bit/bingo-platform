/**
 * Populates a clean, presentable DEMO environment on top of the base
 * `db:seed` data: a genuinely LIVE game (so the lobby never opens cold and
 * empty), an OPEN game ready for the walkthrough presenter to join live,
 * and a further-out SCHEDULED game. Uses the real engine/ticket-purchase
 * code paths (not raw Prisma writes) so every game created here is
 * indistinguishable from one a real admin created by hand — same seed
 * commitment, same ledger entries, same state-machine transitions.
 *
 * Safe to re-run: the LIVE and OPEN games are topped up by *status* (so
 * re-running after the previous demo game naturally completed still
 * leaves the lobby non-empty), the SCHEDULED game is topped up by name.
 * NEVER run against a production database.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

// tsx doesn't auto-load Next.js's .env.local the way `next dev`/`next build`
// do — load it explicitly so this script sees the same DATABASE_URL,
// REDIS_URL, and secrets the running app uses.
process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local"));
process.env.GAME_STARTING_COUNTDOWN_SECONDS = "3";

import { prisma } from "@bingo/db";
import { createGame, openGame, scheduleGame, startGame } from "../lib/game/engine";
import { purchaseTickets } from "../lib/game/tickets";

const DAY_MS = 24 * 60 * 60 * 1000;

async function getUserId(username: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { username }, select: { id: true } });
  return user.id;
}

async function getPatternId(name: string): Promise<string> {
  const pattern = await prisma.winningPattern.findUniqueOrThrow({ where: { name }, select: { id: true } });
  return pattern.id;
}

async function getPrizeRuleId(name: string): Promise<string> {
  const rule = await prisma.prizeRule.findUniqueOrThrow({ where: { name }, select: { id: true } });
  return rule.id;
}

async function hasGameWithStatus(...statuses: string[]): Promise<boolean> {
  const existing = await prisma.game.findFirst({ where: { status: { in: statuses as never[] } }, select: { id: true } });
  return existing !== null;
}

// A game can sit in OPEN/FULL status indefinitely while its registration
// window has actually lapsed (nothing transitions it out of OPEN just
// because registrationCloseAt passed) — checking status alone let a stale,
// no-longer-purchasable game masquerade as "ready" across re-runs of this
// script days apart. Require the window to still be open too.
async function hasOpenGameAcceptingRegistration(): Promise<boolean> {
  const existing = await prisma.game.findFirst({
    where: { status: { in: ["OPEN", "FULL"] }, registrationCloseAt: { gt: new Date() } },
    select: { id: true },
  });
  return existing !== null;
}

async function hasUpcomingGameNamed(name: string): Promise<boolean> {
  const existing = await prisma.game.findFirst({
    where: { name, startTime: { gt: new Date() } },
    select: { id: true },
  });
  return existing !== null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const adminId = await getUserId("admin");
  const oneLine = await getPatternId("One Horizontal Line");
  const fullHouse = await getPatternId("Full House (Blackout)");
  const standardSplit = await getPrizeRuleId("Standard 70/30 Split");

  const now = new Date();

  // 1. A genuinely LIVE game, already in progress, so the lobby's "Live
  //    Now" section is never empty. AUTO-calling self-heals on the first
  //    SSE connection (see ensureAutoCallerRunning in lib/game/engine.ts),
  //    so it starts calling for real the moment anyone opens the room.
  if (!(await hasGameWithStatus("LIVE", "STARTING"))) {
    console.log("Creating LIVE demo game: Community Bingo Night");
    const startTime = new Date(now.getTime() + 2 * 60 * 1000);
    const game = await createGame(
      {
        // Full House takes longer to hit naturally than a one-line pattern —
        // deliberate, so a freshly re-seeded LIVE game stays LIVE for a
        // reasonable demo window instead of completing within a minute.
        name: `Community Bingo Night — ${startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        description: "A relaxed game — great for a quick demo round.",
        gameDate: startTime,
        startTime,
        registrationOpenAt: new Date(now.getTime() - 10 * 60 * 1000),
        registrationCloseAt: startTime,
        ticketPrice: 10,
        maxPlayers: 50,
        maxTicketsPerPlayer: 1000,
        minPlayers: 2,
        callIntervalSeconds: 6,
        callMode: "AUTO",
        manualMarkEnabled: true,
        winningPatternId: fullHouse,
        prizeRuleId: standardSplit,
      },
      adminId,
    );
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: await getUserId("player2"), ticketCount: 1 });
    await purchaseTickets({ gameId: game.id, userId: await getUserId("player3"), ticketCount: 2 });
    await purchaseTickets({ gameId: game.id, userId: await getUserId("player4"), ticketCount: 1 });
    await startGame(game.id, adminId);
    // Wait out the (shortened) STARTING countdown in-process so the game
    // actually reaches LIVE before this script exits — the countdown timer
    // lives only in this process's memory.
    await sleep(4000);
    const final = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    console.log(`  -> status: ${final.status}`);
  } else {
    console.log("Skipping LIVE demo game (a LIVE/STARTING game already exists).");
  }

  // 2. An OPEN game with a couple of tickets already sold, ready for the
  //    walkthrough presenter's own account to buy the last ticket and for
  //    the admin to start it live in front of an audience.
  if (!(await hasOpenGameAcceptingRegistration())) {
    console.log("Creating OPEN demo game: Friday Jackpot Bingo");
    const startTime = new Date(now.getTime() + 45 * 60 * 1000);
    const game = await createGame(
      {
        name: `Friday Jackpot Bingo — ${startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        description: "Full house wins the jackpot — the flagship game for a live walkthrough.",
        gameDate: startTime,
        startTime,
        registrationOpenAt: new Date(now.getTime() - 5 * 60 * 1000),
        registrationCloseAt: startTime,
        ticketPrice: 20,
        maxPlayers: 100,
        maxTicketsPerPlayer: 1000,
        minPlayers: 2,
        jackpotAmount: 200,
        callIntervalSeconds: 5,
        callMode: "AUTO",
        manualMarkEnabled: true,
        winningPatternId: fullHouse,
        prizeRuleId: standardSplit,
      },
      adminId,
    );
    await scheduleGame(game.id, adminId);
    await openGame(game.id, adminId);
    await purchaseTickets({ gameId: game.id, userId: await getUserId("player4"), ticketCount: 1 });
    await purchaseTickets({ gameId: game.id, userId: await getUserId("player5"), ticketCount: 1 });
    console.log("  -> status: OPEN (ready for a player to join and the admin to start it live)");
  } else {
    console.log("Skipping OPEN demo game (an OPEN/FULL game already exists).");
  }

  // 3. A further-out SCHEDULED game so "Upcoming" shows more than one
  //    entry and demonstrates scheduling, not just an immediate start.
  if (!(await hasUpcomingGameNamed("Sunday Family Bingo"))) {
    console.log("Creating SCHEDULED demo game: Sunday Family Bingo");
    const startTime = new Date(now.getTime() + 2 * DAY_MS);
    const scheduled = await createGame(
      {
        name: "Sunday Family Bingo",
        description: "A bigger weekend game with a higher ticket cap per player.",
        gameDate: startTime,
        startTime,
        registrationOpenAt: new Date(now.getTime() + DAY_MS),
        registrationCloseAt: startTime,
        ticketPrice: 15,
        maxPlayers: 200,
        maxTicketsPerPlayer: 1000,
        minPlayers: 3,
        callIntervalSeconds: 5,
        callMode: "AUTO",
        manualMarkEnabled: true,
        winningPatternId: oneLine,
        prizeRuleId: standardSplit,
      },
      adminId,
    );
    await scheduleGame(scheduled.id, adminId);
    console.log("  -> status: SCHEDULED (visible in the lobby's Upcoming section)");
  } else {
    console.log("Skipping Sunday Family Bingo (already exists).");
  }

  console.log("\nDemo game seeding complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The LIVE game's AUTO-caller runs on a setInterval in *this* process,
    // which would otherwise keep this one-off script alive forever. The
    // real dev/prod server re-arms its own timer for the same game the
    // moment any client connects (see ensureAutoCallerRunning), so it's
    // safe to just exit here.
    process.exit(0);
  });
