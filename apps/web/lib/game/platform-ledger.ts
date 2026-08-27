import { Prisma, prisma, type PlatformLedgerType } from "@bingo/db";
import { ConflictError } from "../errors";

/**
 * The counterparty ledger for the platform's own custody account — see the
 * schema comment on `PlatformAccount` for why this exists. Two entry points:
 *
 *  - `applyPlatformLedgerEntryInTx` — for callers that already hold an open
 *    Prisma transaction (e.g. ticket purchase's SERIALIZABLE tx, or a
 *    winner-payout transaction) and must apply the platform-side entry
 *    atomically with their own writes. Retries the optimistic-lock race
 *    internally using fresh reads on the *same* transaction (safe under
 *    Postgres's default READ COMMITTED, where each statement sees newly
 *    committed data) rather than bubbling a retry signal up to the caller,
 *    who has no way to "restart" a transaction it's already mid-way through.
 *  - `applyPlatformLedgerEntry` — standalone, owns its own transaction, for
 *    callers with no existing transaction to join (refunds, forfeiture).
 *
 * Both are idempotent by `referenceId`: calling twice with the same
 * reference returns the original row instead of double-applying.
 */

const DELTA_SIGN: Record<PlatformLedgerType, 1 | -1 | 0> = {
  PRIZE_POOL_CONTRIBUTION: 1,
  PLATFORM_FEE_REVENUE: 1,
  PRIZE_PAYOUT: -1,
  PRIZE_POOL_FORFEITED: 0, // reclassifies already-held funds from liability to revenue; no cash movement
  REFUND: -1,
  PLATFORM_ADJUSTMENT: 1, // the platform's own working capital, independent of any player deposit — see the schema comment on PlatformLedgerType
};

export interface PlatformLedgerInput {
  type: PlatformLedgerType;
  amount: number | string | Prisma.Decimal;
  referenceId: string;
  relatedGameId?: string;
  relatedTicketId?: string;
  relatedWinnerId?: string;
  metadata?: Record<string, unknown>;
}

export class PlatformInsufficientFundsError extends ConflictError {
  constructor() {
    super("Platform account has insufficient funds for this operation — data integrity error, requires investigation.");
  }
}

// NOTE: deliberately no try/catch-and-recover around a P2002 here. Once any
// statement inside a Postgres transaction errors, the whole transaction is
// aborted (SQLSTATE 25P02) and no further statement — including a "recovery"
// lookup — can run against it. The only correct response to a unique-
// constraint race inside a transaction is to let it propagate and abort the
// transaction, so the caller's outer retry loop starts a genuinely fresh one.
async function getOrCreateAccount(tx: Prisma.TransactionClient) {
  const existing = await tx.platformAccount.findUnique({ where: { singleton: 1 } });
  if (existing) return existing;
  return tx.platformAccount.create({ data: { singleton: 1 } });
}

const INNER_RETRIES = 15;

export async function applyPlatformLedgerEntryInTx(tx: Prisma.TransactionClient, input: PlatformLedgerInput) {
  const existing = await tx.platformLedgerEntry.findUnique({ where: { referenceId: input.referenceId } });
  if (existing) return existing;

  const amount = new Prisma.Decimal(input.amount);
  const sign = DELTA_SIGN[input.type];

  for (let attempt = 0; attempt < INNER_RETRIES; attempt++) {
    const account = await getOrCreateAccount(tx);
    const balanceBefore = account.availableBalance;
    const balanceAfter = sign === 0 ? balanceBefore : sign > 0 ? balanceBefore.plus(amount) : balanceBefore.minus(amount);

    if (sign < 0 && balanceAfter.lt(0)) throw new PlatformInsufficientFundsError();

    const updateResult = await tx.platformAccount.updateMany({
      where: { id: account.id, version: account.version },
      data: { availableBalance: balanceAfter, version: { increment: 1 } },
    });
    if (updateResult.count === 0) continue; // another concurrent writer won this round — fresh read next loop

    // If two concurrent transactions both pass the idempotency check above
    // (neither has committed yet) and both reach here with the same
    // referenceId, this throws P2002 and aborts — by design, not caught
    // here (see the note above `getOrCreateAccount`). The caller's own
    // retry loop (payout.ts's payWinner, or applyPlatformLedgerEntry below)
    // starts a fresh transaction, whose idempotency check then finds
    // whichever one committed first.
    return tx.platformLedgerEntry.create({
      data: {
        accountId: account.id,
        type: input.type,
        amount,
        balanceBefore,
        balanceAfter,
        referenceId: input.referenceId,
        relatedGameId: input.relatedGameId,
        relatedTicketId: input.relatedTicketId,
        relatedWinnerId: input.relatedWinnerId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
  throw new Error(`Platform ledger entry ${input.referenceId} lost the optimistic-lock race ${INNER_RETRIES} times in a row.`);
}

const OUTER_RETRIES = 10;

export async function applyPlatformLedgerEntry(input: PlatformLedgerInput) {
  for (let attempt = 0; attempt < OUTER_RETRIES; attempt++) {
    const existing = await prisma.platformLedgerEntry.findUnique({ where: { referenceId: input.referenceId } });
    if (existing) return existing;
    try {
      return await prisma.$transaction((tx) => applyPlatformLedgerEntryInTx(tx, input));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // a concurrent caller won the referenceId race — retry finds their committed row above
      throw err;
    }
  }
  throw new Error(`Platform ledger entry ${input.referenceId} failed after ${OUTER_RETRIES} concurrent-modification retries.`);
}

export async function getPlatformAccountSummary() {
  const account = await prisma.platformAccount.findUnique({ where: { singleton: 1 } });
  return { availableBalance: (account?.availableBalance ?? new Prisma.Decimal(0)).toString() };
}
