import { Prisma, prisma, type WalletTxType } from "@bingo/db";
import { ConflictError, ValidationError } from "./errors";

export class InsufficientFundsError extends ValidationError {
  constructor() {
    super("Insufficient wallet balance for this operation.");
  }
}

export interface ApplyWalletTransactionInput {
  userId: string;
  type: WalletTxType;
  direction: "CREDIT" | "DEBIT";
  amount: number | string;
  referenceId: string; // idempotency key — callers must make this unique per logical operation
  provider?: string;
  providerTransactionId?: string;
  relatedPaymentId?: string;
  relatedWithdrawalId?: string;
  relatedTicketId?: string;
  relatedGameId?: string;
  metadata?: Record<string, unknown>;
}

const MAX_RETRIES = 5;

/**
 * The single write path for every wallet balance change in the platform.
 * Never mutate `Wallet.availableBalance` directly anywhere else.
 *
 * Guarantees:
 *  - Idempotent: calling twice with the same `referenceId` returns the
 *    original ledger row instead of double-applying (protects against
 *    retried requests and duplicate payment callbacks).
 *  - Race-safe: uses optimistic concurrency (a `version` column on Wallet)
 *    so two concurrent purchases/deposits for the same user can never both
 *    read a stale balance and overwrite each other — one wins, the other
 *    retries against the fresh balance. This is what prevents double
 *    spending under concurrent ticket purchases.
 *  - Every balance change produces an immutable `WalletTransaction` row
 *    with `balanceBefore`/`balanceAfter` — no bare balance mutation.
 */
export async function applyWalletTransaction(input: ApplyWalletTransactionInput) {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) throw new ValidationError("Transaction amount must be greater than zero.");

  const existing = await prisma.walletTransaction.findUnique({ where: { referenceId: input.referenceId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });

        const balanceBefore = wallet.availableBalance;
        const balanceAfter =
          input.direction === "CREDIT" ? balanceBefore.plus(amount) : balanceBefore.minus(amount);

        if (input.direction === "DEBIT" && balanceAfter.lt(0)) {
          throw new InsufficientFundsError();
        }

        const updateResult = await tx.wallet.updateMany({
          where: { id: wallet.id, version: wallet.version },
          data: { availableBalance: balanceAfter, version: { increment: 1 } },
        });

        if (updateResult.count === 0) {
          // Someone else modified the wallet between our read and write —
          // signal the outer loop to retry against a fresh read.
          throw new ConcurrentModificationError();
        }

        return tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId: input.userId,
            type: input.type,
            status: "COMPLETED",
            amount,
            balanceBefore,
            balanceAfter,
            provider: input.provider,
            providerTransactionId: input.providerTransactionId,
            referenceId: input.referenceId,
            relatedPaymentId: input.relatedPaymentId,
            relatedWithdrawalId: input.relatedWithdrawalId,
            relatedTicketId: input.relatedTicketId,
            relatedGameId: input.relatedGameId,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
          },
        });
      });
    } catch (err) {
      if (err instanceof ConcurrentModificationError) {
        continue; // retry with a fresh wallet read
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Two concurrent callers raced on the same referenceId — the loser
        // just returns the winner's row instead of erroring.
        const winner = await prisma.walletTransaction.findUnique({ where: { referenceId: input.referenceId } });
        if (winner) return winner;
      }
      throw err;
    }
  }

  throw new Error(`Wallet update for user ${input.userId} failed after ${MAX_RETRIES} concurrent-modification retries.`);
}

class ConcurrentModificationError extends Error {}

export async function getWalletSummary(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { availableBalance: true, pendingBalance: true, currency: true },
  });
  return wallet;
}
