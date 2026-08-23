import { Prisma, prisma } from "@bingo/db";
import { applyPlatformLedgerEntryInTx } from "./platform-ledger";

export interface PayWinnerInput {
  userId: string;
  amount: number | string | Prisma.Decimal;
  referenceId: string; // idempotency key, e.g. `winner-payout:${winner.id}`
  relatedGameId: string;
  relatedTicketId: string;
  relatedWinnerId: string;
}

class WalletConcurrentModificationError extends Error {}

const MAX_RETRIES = 15;

/**
 * Atomically pays a winner: debits the platform account (PRIZE_PAYOUT) and
 * credits the winner's wallet (WINNING_PAYOUT) in ONE database transaction,
 * so a process crash between the two is impossible — either both happen or
 * neither does. Idempotent by `referenceId`: safe to call repeatedly (a
 * retried request, a repair job re-running after a partial prior failure)
 * without ever double-paying. Every attempt re-checks for the committed
 * result first, both outside and inside the transaction, so concurrent
 * callers racing on the same referenceId converge on exactly one payout.
 */
export async function payWinner(input: PayWinnerInput) {
  const existing = await prisma.walletTransaction.findUnique({ where: { referenceId: input.referenceId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existingInTx = await tx.walletTransaction.findUnique({ where: { referenceId: input.referenceId } });
        if (existingInTx) return existingInTx;

        await applyPlatformLedgerEntryInTx(tx, {
          type: "PRIZE_PAYOUT",
          amount: input.amount,
          referenceId: `platform:${input.referenceId}`,
          relatedGameId: input.relatedGameId,
          relatedTicketId: input.relatedTicketId,
          relatedWinnerId: input.relatedWinnerId,
        });

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
        const amount = new Prisma.Decimal(input.amount);
        const balanceBefore = wallet.availableBalance;
        const balanceAfter = balanceBefore.plus(amount);

        const updateResult = await tx.wallet.updateMany({
          where: { id: wallet.id, version: wallet.version },
          data: { availableBalance: balanceAfter, version: { increment: 1 } },
        });
        if (updateResult.count === 0) throw new WalletConcurrentModificationError();

        return tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId: input.userId,
            type: "WINNING_PAYOUT",
            status: "COMPLETED",
            amount,
            balanceBefore,
            balanceAfter,
            referenceId: input.referenceId,
            relatedGameId: input.relatedGameId,
            relatedTicketId: input.relatedTicketId,
          },
        });
      });
    } catch (err) {
      if (err instanceof WalletConcurrentModificationError) continue;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // A concurrent call won either the platform-ledger or the wallet
        // referenceId race and aborted this transaction (Postgres 25P02
        // forbids further queries against it, so there's no recovery
        // lookup to attempt on `tx` here) — retry with a fresh transaction;
        // its own existence checks at the top of the loop will find
        // whichever attempt actually committed.
        continue;
      }
      throw err;
    }
  }
  throw new Error(`payWinner for reference ${input.referenceId} failed after ${MAX_RETRIES} concurrent-modification retries.`);
}
