// Zero-install local Postgres for dev/test, mirroring apps/web/scripts/dev-redis.mjs.
// Downloads (once, cached under ~/.embedded-postgres-*) and runs a real
// `postgres` binary via embedded-postgres, then prints a DATABASE_URL to
// put in packages/db/.env / apps/web/.env.local. Not used in production —
// there, DATABASE_URL points at a real managed Postgres instance.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.DEV_PG_PORT ? Number(process.env.DEV_PG_PORT) : 55432;
const user = "bingo";
const password = "bingo_dev_password";
const database = "bingo_dev";
const dataDir = process.env.DEV_PG_DATA_DIR ?? join(tmpdir(), "bingo-dev-pg");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
});

await pg.initialise().catch(() => {}); // no-op if data dir already initialised
await pg.start();
await pg.createDatabase(database).catch(() => {}); // no-op if it already exists

console.log(`DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${port}/${database}`);
console.log("READY");

process.stdin.resume();
async function shutdown() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
