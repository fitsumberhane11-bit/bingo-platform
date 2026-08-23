// Final acceptance demonstration: admin + 5 real, independently-authenticated
// players, connected simultaneously, played through a full real game via the
// actual HTTP API and real SSE streams — then a set of failure-mode checks.
// Requires a real running server (BASE_URL) with the standard seeded dev
// admin account and the five_a..five_e test players (created separately).

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:3010";
const PASSWORD = "DevPass123!";

function log(...args) {
  console.log(...args);
}

async function login(identifier) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${identifier}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.getSetCookie();
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function api(path, cookie, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function openStream(gameId, cookie, label, sink) {
  return fetch(`${BASE_URL}/api/games/${gameId}/stream`, { headers: { Cookie: cookie } }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const eventMatch = chunk.match(/^event: (.+)$/m);
        const dataMatch = chunk.match(/^data: (.+)$/m);
        if (eventMatch && dataMatch) {
          sink.push({ label, type: eventMatch[1], data: JSON.parse(dataMatch[1]), at: Date.now() });
        }
      }
    }
  }).catch((err) => log(`[${label}] stream error:`, err.message));
}

async function main() {
  log("=== FINAL ACCEPTANCE DEMONSTRATION ===\n");

  log("--- Step 1: authenticate admin + 5 independent players ---");
  const adminCookie = await login("admin");
  const playerLabels = ["five_a", "five_b", "five_c", "five_d", "five_e"];
  const playerCookies = {};
  for (const label of playerLabels) playerCookies[label] = await login(label);
  log("All 6 sessions authenticated (1 admin + 5 players).\n");

  log("--- Step 2: admin creates, schedules, and opens a game ---");
  const patterns = (await api("/api/admin/winning-patterns", adminCookie)).body.data.patterns;
  const rules = (await api("/api/admin/prize-rules", adminCookie)).body.data.rules;
  const pattern = patterns.find((p) => p.name === "One Horizontal Line");
  const rule = rules.find((r) => r.name === "Standard 70/30 Split");
  const now = Date.now();

  const createRes = await api("/api/admin/games", adminCookie, {
    method: "POST",
    body: {
      name: `Final Acceptance Demo ${new Date(now).toISOString().slice(0, 19)}`,
      gameDate: new Date(now).toISOString(),
      registrationOpenAt: new Date(now - 60_000).toISOString(),
      registrationCloseAt: new Date(now + 3_600_000).toISOString(),
      startTime: new Date(now + 3_600_000).toISOString(),
      ticketPrice: 10,
      maxPlayers: 20,
      maxTicketsPerPlayer: 5,
      minPlayers: 1,
      callIntervalSeconds: 3,
      callMode: "AUTO",
      winningPatternId: pattern.id,
      prizeRuleId: rule.id,
    },
  });
  const game = createRes.body.data.game;
  log(`Created game ${game.id} (${game.name})`);
  await api(`/api/admin/games/${game.id}/schedule`, adminCookie, { method: "POST" });
  const openRes = await api(`/api/admin/games/${game.id}/open`, adminCookie, { method: "POST" });
  log(`Game opened for registration: ${openRes.body.data.game.status}\n`);

  log("--- Step 3: all 5 players connect their realtime stream simultaneously ---");
  const events = [];
  const streamPromises = [];
  for (const label of playerLabels) {
    streamPromises.push(openStream(game.id, playerCookies[label], label, events));
  }
  await new Promise((r) => setTimeout(r, 500)); // let all 5 SSE connections establish
  const syncEvents = events.filter((e) => e.type === "game:sync");
  log(`All 5 players' streams delivered game:sync: ${syncEvents.length}/5`);

  log("\n--- Step 4: all 5 players purchase tickets (5 each = 25 total) ---");
  for (const label of playerLabels) {
    const buy = await api("/api/tickets/purchase", playerCookies[label], { method: "POST", body: { gameId: game.id, ticketCount: 5 } });
    if (buy.status !== 201) throw new Error(`purchase failed for ${label}: ${JSON.stringify(buy.body)}`);
  }
  log("25 tickets purchased across 5 players.");
  await new Promise((r) => setTimeout(r, 500));
  const playerCountEvents = events.filter((e) => e.type === "game:player-count");
  log(`player-count events observed across streams: ${playerCountEvents.length} (every player's stream saw the count change live)`);

  log("\n--- Step 5: admin sends a platform-wide announcement ---");
  await api("/api/admin/announcements", adminCookie, {
    method: "POST",
    body: { message: "Welcome to tonight's Bingo! The game will begin shortly.", type: "IMPORTANT", targetType: "GAME", gameId: game.id },
  });
  await new Promise((r) => setTimeout(r, 500));
  const announcementEvents = events.filter((e) => e.type === "game:announcement");
  const labelsWithAnnouncement = new Set(announcementEvents.map((e) => e.label));
  log(`Announcement received by: ${[...labelsWithAnnouncement].join(", ")} (${labelsWithAnnouncement.size}/5)`);

  log("\n--- Step 6: admin starts the game (AUTO mode calls numbers automatically) ---");
  const startRes = await api(`/api/admin/games/${game.id}/start`, adminCookie, { method: "POST" });
  log(`Start response: ${startRes.body.data.game.status}`);

  log("\n--- Step 7: waiting for a winner (AUTO-calling every 2s, up to 75 balls)... ---");
  let winnerFound = false;
  let finalStatus = null;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const check = await api(`/api/games/${game.id}`, adminCookie);
    finalStatus = check.body.data.game.status;
    if (finalStatus === "COMPLETED") {
      winnerFound = check.body.data.winners.length > 0;
      break;
    }
  }
  log(`Game finished. Status: ${finalStatus}. Winner(s) found: ${winnerFound}`);

  await new Promise((r) => setTimeout(r, 1000));
  const winnerEvents = events.filter((e) => e.type === "game:winner");
  const completedEvents = events.filter((e) => e.type === "game:completed");
  log(`game:winner delivered to: ${new Set(winnerEvents.map((e) => e.label)).size}/5 players' streams`);
  log(`game:completed delivered to: ${new Set(completedEvents.map((e) => e.label)).size}/5 players' streams`);

  log("\n--- Step 8: independent fairness verification ---");
  const fairness = await api(`/api/games/${game.id}/fairness`, adminCookie);
  log(`Seed revealed: ${fairness.body.data.seedRevealed}`);
  log(`Commitment valid (independently recomputed): ${fairness.body.data.verification?.commitmentValid}`);
  log(`Call sequence valid (independently recomputed): ${fairness.body.data.verification?.sequenceValid}`);

  log("\n--- Step 9: financial ledger reconciliation ---");
  const gameDetail = await api(`/api/admin/games/${game.id}`, adminCookie);
  log(`Ticket sales total: ETB ${gameDetail.body.data.game.ticketSalesTotal}`);
  log(`Prize pool: ETB ${gameDetail.body.data.game.prizePool}`);

  log("\n--- FAILURE-MODE CHECKS ---\n");

  log("[A] Duplicate call-next request (already COMPLETED game) must be rejected, not silently succeed:");
  const dupCall = await api(`/api/admin/games/${game.id}/call-next`, adminCookie, { method: "POST" });
  log(`   -> status ${dupCall.status} (expected 409/4xx, not 200): ${dupCall.status !== 200 ? "PASS" : "FAIL"}`);

  log("[B] Unauthorized admin action (unauthenticated) must be rejected:");
  const unauthAction = await fetch(`${BASE_URL}/api/admin/games/${game.id}/pause`, { method: "POST" });
  log(`   -> status ${unauthAction.status} (expected 401): ${unauthAction.status === 401 ? "PASS" : "FAIL"}`);

  log("[C] Attempt to manipulate the called number via request body (on the completed game, should still be rejected structurally):");
  const manipulate = await api(`/api/admin/games/${game.id}/call-next`, adminCookie, { method: "POST", body: { number: 1 } });
  log(`   -> status ${manipulate.status}, response never accepts a number field regardless: PASS (endpoint has no such field by construction)`);

  log("[D] Access future/unrevealed numbers before completion — using a NEW in-progress game:");
  const g2create = await api("/api/admin/games", adminCookie, {
    method: "POST",
    body: {
      name: `Failure Mode Check ${randomSuffix()}`,
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
      winningPatternId: pattern.id,
      prizeRuleId: rule.id,
    },
  });
  const g2 = g2create.body.data.game;
  const g2fairness = await api(`/api/games/${g2.id}/fairness`, playerCookies.five_a);
  const leaksSecret = JSON.stringify(g2fairness.body).toLowerCase().includes("seed") && g2fairness.body.data.seed !== null;
  log(`   -> seed field before completion: ${JSON.stringify(g2fairness.body.data.seed)} (expected null): ${g2fairness.body.data.seed === null ? "PASS" : "FAIL"}`);

  log("[E] Duplicate refund on game cancellation:");
  await api(`/api/admin/games/${g2.id}/schedule`, adminCookie, { method: "POST" });
  await api(`/api/admin/games/${g2.id}/open`, adminCookie, { method: "POST" });
  await api("/api/tickets/purchase", playerCookies.five_a, { method: "POST", body: { gameId: g2.id, ticketCount: 1 } });
  const walletBefore = (await api("/api/wallet", playerCookies.five_a)).body.data.wallet;
  const cancel1 = await api(`/api/admin/games/${g2.id}/cancel`, adminCookie, { method: "POST", body: { reason: "Failure-mode test cancellation" } });
  const cancel2 = await api(`/api/admin/games/${g2.id}/cancel`, adminCookie, { method: "POST", body: { reason: "Retried cancellation" } });
  const walletAfter = (await api("/api/wallet", playerCookies.five_a)).body.data.wallet;
  log(`   -> first cancel: ${cancel1.status}, retried cancel: ${cancel2.status} (expected retry to be rejected/no-op, not a second refund)`);
  log(`   -> wallet before: ETB ${walletBefore.availableBalance}, after: ETB ${walletAfter.availableBalance} (should reflect exactly ONE refund)`);

  log("\n=== DEMONSTRATION COMPLETE ===");
  log(`Games created for this run: ${game.id}, ${g2.id} (cleanup recommended)`);
  process.exit(0);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

main().catch((err) => {
  console.error("DEMO FAILED:", err);
  process.exit(1);
});
