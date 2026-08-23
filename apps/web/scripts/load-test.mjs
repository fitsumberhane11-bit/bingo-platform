// Load test: opens N concurrent SSE connections to a real running server,
// triggers a real number call, and measures how long each connection takes
// to receive it. Requires a real running dev/prod server (BASE_URL) and a
// game already in LIVE status with MANUAL call mode.
//
// Usage:
//   node scripts/load-test.mjs <concurrency> <adminCookie> <gameId>
//
// Reports connection-establishment and event-propagation latency
// (p50/p95/p99), and prints anything that failed rather than hiding it.

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:3010";
const concurrency = Number(process.argv[2] ?? 100);
const adminCookie = process.argv[3];
const gameId = process.argv[4];

if (!adminCookie || !gameId) {
  console.error("Usage: node scripts/load-test.mjs <concurrency> <adminCookie> <gameId>");
  process.exit(1);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function stats(label, values) {
  const sorted = [...values].sort((a, b) => a - b);
  console.log(
    `${label}: n=${sorted.length}  p50=${percentile(sorted, 50).toFixed(1)}ms  p95=${percentile(sorted, 95).toFixed(1)}ms  p99=${percentile(sorted, 99).toFixed(1)}ms  max=${sorted.at(-1)?.toFixed(1)}ms`,
  );
}

async function openConnection(id) {
  const connectStart = performance.now();
  const res = await fetch(`${BASE_URL}/api/games/${gameId}/stream`, { headers: { Cookie: adminCookie } });
  if (!res.ok || !res.body) throw new Error(`connection ${id} failed: ${res.status}`);
  const connectMs = performance.now() - connectStart;

  const conn = { id, connectMs, numberCalledAt: null, sawSync: false, reader: res.body.getReader() };

  conn.waitForNumberCalled = (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await conn.reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("event: game:sync")) conn.sawSync = true;
      if (buffer.includes("event: game:number-called")) {
        conn.numberCalledAt = performance.now();
        return;
      }
    }
  })().catch(() => {});

  return conn;
}

async function main() {
  console.log(`Load test: opening ${concurrency} concurrent SSE connections to ${BASE_URL} for game ${gameId}...\n`);

  const openStart = performance.now();
  const results = await Promise.allSettled(Array.from({ length: concurrency }, (_, i) => openConnection(i)));
  const openTotalMs = performance.now() - openStart;

  const connections = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failed = results.filter((r) => r.status === "rejected");

  console.log(`Connections established: ${connections.length}/${concurrency} in ${openTotalMs.toFixed(0)}ms total`);
  if (failed.length > 0) {
    console.log(`FAILED to establish: ${failed.length}`);
    console.log(`First failure: ${failed[0].reason?.message ?? failed[0].reason}`);
  }
  stats("Connection establishment latency", connections.map((c) => c.connectMs));
  console.log(`Connections that received game:sync: ${connections.filter((c) => c.sawSync).length}/${connections.length}`);

  console.log("\nTriggering call-next and measuring propagation to all connections...");
  const callSentAt = performance.now();
  const callRes = await fetch(`${BASE_URL}/api/admin/games/${gameId}/call-next`, { method: "POST", headers: { Cookie: adminCookie } });
  const callRoundTripMs = performance.now() - callSentAt;
  if (!callRes.ok) {
    console.error(`call-next failed: ${callRes.status} ${await callRes.text()}`);
    process.exit(1);
  }
  console.log(`call-next HTTP round trip: ${callRoundTripMs.toFixed(0)}ms`);

  await Promise.race([
    Promise.allSettled(connections.map((c) => c.waitForNumberCalled)),
    new Promise((resolve) => setTimeout(resolve, 15000)), // hard cap so one stuck connection can't hang the whole run
  ]);

  const received = connections.filter((c) => c.numberCalledAt !== null);
  const propagationLatencies = received.map((c) => c.numberCalledAt - callSentAt);

  console.log(`\nConnections that received the number-called event within 15s: ${received.length}/${connections.length}`);
  if (received.length < connections.length) {
    console.log(`MISSED: ${connections.length - received.length} connections never received the event — investigate before trusting this result.`);
  }
  stats("Event propagation latency (call-next sent -> event received)", propagationLatencies);

  for (const c of connections) {
    try {
      await c.reader.cancel();
    } catch {
      // already closed
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
