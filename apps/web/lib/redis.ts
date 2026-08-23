import Redis from "ioredis";
import { getEnv } from "./env";

/**
 * Three accessors sharing one set of underlying connections, all stored on
 * `globalThis` for the same reason as the Prisma client: Next.js dev mode
 * compiles each API route into its own webpack module graph, so a plain
 * module-scoped variable would not be shared across routes.
 *
 *  - `getRedis()` — a single general-purpose connection (rate limiting,
 *    distributed locks). Returns `null` when REDIS_URL is unset so callers
 *    can gracefully fall back to an in-process implementation for local
 *    dev with zero external dependencies.
 *  - `getRedisPublisher()` / `getRedisSubscriber()` — dedicated connections
 *    for the game-event broadcaster. ioredis requires a *separate*
 *    connection once it enters SUBSCRIBE mode (a subscribed connection
 *    can't issue other commands), so pub and sub can never share
 *    `getRedis()`'s connection. Both throw if REDIS_URL is unset — callers
 *    must check `isRedisConfigured()` first, since the broadcaster has its
 *    own single-instance fallback rather than silently doing nothing.
 */
const globalForRedis = globalThis as unknown as {
  __redis?: Redis;
  __redisPub?: Redis;
  __redisSub?: Redis;
};

export function isRedisConfigured(): boolean {
  return Boolean(getEnv().REDIS_URL);
}

function createClient(): Redis {
  const url = getEnv().REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured — call isRedisConfigured() first.");
  return new Redis(url, {
    maxRetriesPerRequest: null, // never give up on a long-lived connection; keep retrying in the background
    retryStrategy: (attempt) => Math.min(1000, 50 * attempt),
  });
}

export function getRedis(): Redis | null {
  if (!isRedisConfigured()) return null;
  if (!globalForRedis.__redis) globalForRedis.__redis = createClient();
  return globalForRedis.__redis;
}

export function getRedisPublisher(): Redis {
  if (!globalForRedis.__redisPub) globalForRedis.__redisPub = createClient();
  return globalForRedis.__redisPub;
}

export function getRedisSubscriber(): Redis {
  if (!globalForRedis.__redisSub) globalForRedis.__redisSub = createClient();
  return globalForRedis.__redisSub;
}
