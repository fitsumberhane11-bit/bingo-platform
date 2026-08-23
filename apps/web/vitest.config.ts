import { defineConfig } from "vitest/config";

// Unlike `next dev`/`next build`, vitest doesn't load .env.local on its
// own — without this, every test touching lib/env.ts fails immediately
// with "Invalid environment configuration" on a fresh checkout. CI sets
// these directly as job env vars instead (see .github/workflows/ci.yml),
// so this is a no-op harmless there; loadEnvFile itself no-ops if the file
// is already loaded, and throws only if the file is missing entirely.
try {
  process.loadEnvFile(new URL("./.env.local", import.meta.url));
} catch {
  // No .env.local (e.g. CI) — env vars are expected to be set another way.
}

// Real game-start countdown is 10s (see lib/game/engine.ts) — not worth
// burning real wall-clock time on in every test that starts a game.
process.env.GAME_STARTING_COUNTDOWN_SECONDS = "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    testTimeout: 30000,
    globalSetup: ["./test/redis-global-setup.ts"],
    // Several suites here exercise real wall-clock timing (countdown
    // timers, auto-caller intervals, realtime HTTP round trips against a
    // live server) against a real, shared Postgres/Redis. Running test
    // FILES in parallel lets them starve each other for CPU and produces
    // rare, non-deterministic timeouts that are a test-infra artifact, not
    // a product bug — serial execution trades a few extra seconds of wall
    // time for a suite that means what it says when it's green.
    fileParallelism: false,
  },
});
