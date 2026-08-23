// Zero-install local Redis for `pnpm dev`. Downloads (once, cached) and runs
// a real `redis-server` binary via redis-memory-server, then prints a
// REDIS_URL to put in apps/web/.env.local. Not used in production — there,
// REDIS_URL points at a real managed Redis (see docker-compose.yml / infra).
import { RedisMemoryServer } from "redis-memory-server";

const port = process.env.DEV_REDIS_PORT ? Number(process.env.DEV_REDIS_PORT) : undefined;
const server = new RedisMemoryServer(port ? { instance: { port } } : undefined);
const host = await server.getHost();
const boundPort = await server.getPort();

console.log(`REDIS_URL=redis://${host}:${boundPort}`);
console.log("READY");

process.stdin.resume();
process.on("SIGTERM", async () => {
  await server.stop();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});
