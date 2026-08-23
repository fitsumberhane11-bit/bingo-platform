import { prisma, Prisma } from "@bingo/db";

/**
 * Runs `fn` inside a Postgres SERIALIZABLE transaction and retries on a
 * serialization failure (Postgres error 40001) — the standard pattern for
 * "check a condition, then write" operations (like ticket-capacity checks)
 * that plain read-then-write logic cannot make safe under concurrency.
 * Postgres itself detects the conflicting concurrent transactions; this
 * just retries the loser instead of surfacing a confusing 500.
 */
export async function withSerializableRetry<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 20,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 10000 });
    } catch (err) {
      if (isSerializationFailure(err) && attempt < maxRetries - 1) {
        // Backoff with jitter — under high contention (e.g. 20 requests
        // racing for 8 seats), retrying instantly just recreates the same
        // collision. A small randomized delay spreads retries out so the
        // legitimate winners each get a clear run instead of every loser
        // exhausting its retry budget in lockstep.
        const backoffMs = Math.min(500, 10 * 2 ** attempt) * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable: retry loop exhausted without returning or throwing.");
}

function isSerializationFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034 is Prisma's own mapping for "transaction failed due to a write conflict".
    return err.code === "P2034";
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("40001") || message.toLowerCase().includes("could not serialize access");
}
