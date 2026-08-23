import { RedisMemoryServer } from "redis-memory-server";

/**
 * Vitest globalSetup: boots one real Redis instance (a real prebuilt
 * `redis-server` binary, not a mock/stub) for the whole test run, and
 * points REDIS_URL at it so every test exercises the actual
 * `RedisBroadcaster` path — the same code that runs in production —
 * instead of the single-instance in-memory fallback.
 */
export default async function setup() {
  const server = new RedisMemoryServer();
  const host = await server.getHost();
  const port = await server.getPort();
  process.env.REDIS_URL = `redis://${host}:${port}`;

  return async () => {
    await server.stop();
  };
}
