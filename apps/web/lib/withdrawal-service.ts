import { randomUUID } from "node:crypto";
import { Prisma, prisma, type Withdrawal, type WithdrawalStatus, type PaymentProviderType } from "@bingo/db";
import { ConflictError, ForbiddenError, MaintenanceModeError, NotFoundError, ValidationError } from "./errors";
import { InsufficientFundsError } from "./wallet-service";
import { getSystemSetting, isMaintenanceModeEnabled } from "./system-settings";
import { writeAuditLog } from "./audit";
import { notifyUser } from "./notifications";

const MAX_RETRIES = 5;
class ConcurrentModificationError extends Error {}

export async function getWithdrawalLimits() {
  const [min, max, dailyLimit, autoApproveThreshold] = await Promise.all([
    getSystemSetting("withdrawal.min", 50),
    getSystemSetting("withdrawal.max", 20000),
    getSystemSetting("withdrawal.dailyLimit", 30000),
    getSystemSetting("withdrawal.autoApproveThreshold", 0),
  ]);
  return { min, max, dailyLimit, autoApproveThreshold };
}

/**
 * Requests a withdrawal and atomically reserves the funds (moves the amount
 * from `availableBalance` to `pendingBalance` on the same wallet row, using
 * the same optimistic-concurrency retry pattern as `applyWalletTransaction`).
 * This is what makes "two concurrent withdrawal requests against one
 * balance" safe: the second request's balance check runs against a fresh
 * read after the first commits, so it correctly sees the already-reduced
 * available balance.
 *
 * Funds are NOT yet debited from the wallet's total value here — that only
 * happens when the withdrawal actually COMPLETES (see `transitionWithdrawal`).
 * A REQUESTED/UNDER_REVIEW/APPROVED/PROCESSING withdrawal still belongs to
 * the player; it is merely reserved and unavailable for spending.
 */
export async function requestWithdrawal(input: {
  userId: string;
  amount: number | string;
  provider: PaymentProviderType;
  destinationAccount: string;
}): Promise<Withdrawal> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) throw new ValidationError("Withdrawal amount must be greater than zero.");
  if (!input.destinationAccount || input.destinationAccount.trim().length < 3) {
    throw new ValidationError("A destination account/phone number is required.");
  }
  // New withdrawal requests are paused during maintenance; Finance can still
  // review/approve/complete already-requested withdrawals (those actions
  // aren't gated here) since that work doesn't depend on the player-facing
  // surfaces maintenance mode is protecting.
  if (await isMaintenanceModeEnabled()) throw new MaintenanceModeError("Withdrawal requests are paused during maintenance. Please try again shortly.");

  const { min, max, dailyLimit } = await getWithdrawalLimits();
  if (amount.lt(min) || amount.gt(max)) {
    throw new ValidationError(`Withdrawal amount must be between ETB ${min} and ETB ${max}.`);
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const todaysWithdrawals = await prisma.withdrawal.findMany({
    where: {
      userId: input.userId,
      createdAt: { gte: since },
      status: { notIn: ["REJECTED", "CANCELLED"] },
    },
    select: { amount: true },
  });
  const todaysTotal = todaysWithdrawals.reduce((sum, w) => sum.plus(w.amount), new Prisma.Decimal(0));
  if (todaysTotal.plus(amount).gt(dailyLimit)) {
    throw new ValidationError(`This would exceed your daily withdrawal limit of ETB ${dailyLimit}.`);
  }

  const reference = `withdrawal:${input.userId}:${randomUUID()}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const withdrawal = await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });

        const balanceBefore = wallet.availableBalance;
        if (balanceBefore.lt(amount)) throw new InsufficientFundsError();
        const balanceAfter = balanceBefore.minus(amount);

        const updateResult = await tx.wallet.updateMany({
          where: { id: wallet.id, version: wallet.version },
          data: {
            availableBalance: balanceAfter,
            pendingBalance: { increment: amount },
            version: { increment: 1 },
          },
        });
        if (updateResult.count === 0) throw new ConcurrentModificationError();

        const created = await tx.withdrawal.create({
          data: {
            userId: input.userId,
            amount,
            provider: input.provider,
            destinationAccount: input.destinationAccount,
            reference,
            status: "REQUESTED",
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId: input.userId,
            type: "WITHDRAWAL",
            status: "PENDING",
            amount,
            balanceBefore,
            balanceAfter,
            referenceId: `withdrawal-reserve:${created.id}`,
            relatedWithdrawalId: created.id,
            metadata: { stage: "reserved" },
          },
        });

        return created;
      });

      await writeAuditLog({
        actorUserId: input.userId,
        action: "WITHDRAWAL_REQUESTED",
        entityType: "Withdrawal",
        entityId: withdrawal.id,
        newValue: { amount: amount.toString(), provider: input.provider },
      });
      await notifyUser({
        userId: input.userId,
        type: "WITHDRAWAL_REQUESTED",
        title: "Withdrawal requested",
        body: `Your withdrawal request for ETB ${amount.toString()} has been submitted and is pending review.`,
      });

      return withdrawal;
    } catch (err) {
      if (err instanceof ConcurrentModificationError) continue;
      throw err;
    }
  }

  throw new Error(`Withdrawal request for user ${input.userId} failed after ${MAX_RETRIES} concurrent-modification retries.`);
}

const ALLOWED_TRANSITIONS: Record<string, { from: WithdrawalStatus[]; releasesReservation: boolean; completesReservation: boolean }> = {
  UNDER_REVIEW: { from: ["REQUESTED"], releasesReservation: false, completesReservation: false },
  APPROVE: { from: ["REQUESTED", "UNDER_REVIEW"], releasesReservation: false, completesReservation: false },
  REJECT: { from: ["REQUESTED", "UNDER_REVIEW", "APPROVED"], releasesReservation: true, completesReservation: false },
  MARK_PROCESSING: { from: ["APPROVED"], releasesReservation: false, completesReservation: false },
  MARK_COMPLETED: { from: ["PROCESSING", "APPROVED"], releasesReservation: false, completesReservation: true },
  CANCEL: { from: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"], releasesReservation: true, completesReservation: false },
};

const TARGET_STATUS: Record<keyof typeof ALLOWED_TRANSITIONS, WithdrawalStatus> = {
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  MARK_PROCESSING: "PROCESSING",
  MARK_COMPLETED: "COMPLETED",
  CANCEL: "CANCELLED",
};

export type WithdrawalAction = keyof typeof ALLOWED_TRANSITIONS;

/**
 * Every state change (admin review actions, or a player cancelling their own
 * still-pending request) goes through here. Uses the same conditional
 * `updateMany(WHERE id=X AND status IN [allowed])` guard the payment
 * pipeline uses — under concurrent/duplicate requests (e.g. an admin
 * double-clicking Approve, or a retried request), exactly one caller's
 * update actually matches and the rest get a clean 409 instead of
 * corrupting state or double-releasing funds.
 */
export async function transitionWithdrawal(input: {
  withdrawalId: string;
  action: WithdrawalAction;
  actorUserId: string;
  reason?: string;
  isPlayerSelfCancel?: boolean;
}): Promise<Withdrawal> {
  const rule = ALLOWED_TRANSITIONS[input.action]!;
  const targetStatus = TARGET_STATUS[input.action];

  const existing = await prisma.withdrawal.findUnique({ where: { id: input.withdrawalId } });
  if (!existing) throw new NotFoundError("Withdrawal not found.");

  if (input.isPlayerSelfCancel) {
    if (existing.userId !== input.actorUserId) {
      throw new ForbiddenError("You can only cancel your own withdrawal requests.");
    }
    if (input.action !== "CANCEL") {
      throw new ForbiddenError("Players may only cancel a withdrawal, not change its review status.");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.withdrawal.updateMany({
      where: { id: input.withdrawalId, status: { in: rule.from } },
      data: {
        status: targetStatus,
        reviewedByUserId: input.isPlayerSelfCancel ? existing.reviewedByUserId : input.actorUserId,
        reviewedAt: input.isPlayerSelfCancel ? existing.reviewedAt : new Date(),
        reason: input.reason ?? existing.reason,
      },
    });
    if (updateResult.count === 0) {
      throw new ConflictError(
        `Withdrawal cannot be transitioned to ${targetStatus} from its current status (${existing.status}). It may have already been processed.`,
      );
    }

    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId } });

    if (rule.releasesReservation) {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: withdrawal.userId } });
      const balanceBefore = wallet.availableBalance;
      const balanceAfter = balanceBefore.plus(withdrawal.amount);

      const walletUpdate = await tx.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: {
          availableBalance: balanceAfter,
          pendingBalance: { decrement: withdrawal.amount },
          version: { increment: 1 },
        },
      });
      if (walletUpdate.count === 0) throw new ConcurrentModificationError();

      await tx.walletTransaction.updateMany({
        where: { relatedWithdrawalId: withdrawal.id, type: "WITHDRAWAL", status: "PENDING" },
        data: { status: "REVERSED" },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: withdrawal.userId,
          type: "REVERSAL",
          status: "COMPLETED",
          amount: withdrawal.amount,
          balanceBefore,
          balanceAfter,
          referenceId: `withdrawal-release:${withdrawal.id}`,
          relatedWithdrawalId: withdrawal.id,
          metadata: { reason: targetStatus === "REJECTED" ? "withdrawal_rejected" : "withdrawal_cancelled" },
        },
      });
    }

    if (rule.completesReservation) {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: withdrawal.userId } });
      const walletUpdate = await tx.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: { pendingBalance: { decrement: withdrawal.amount }, version: { increment: 1 } },
      });
      if (walletUpdate.count === 0) throw new ConcurrentModificationError();

      await tx.walletTransaction.updateMany({
        where: { relatedWithdrawalId: withdrawal.id, type: "WITHDRAWAL", status: "PENDING" },
        data: { status: "COMPLETED" },
      });
    }

    return withdrawal;
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: `WITHDRAWAL_${input.action}`,
    entityType: "Withdrawal",
    entityId: result.id,
    oldValue: { status: existing.status },
    newValue: { status: targetStatus, reason: input.reason },
  });

  const notifyCopy: Partial<Record<WithdrawalAction, { title: string; body: string }>> = {
    APPROVE: { title: "Withdrawal approved", body: `Your withdrawal of ETB ${result.amount.toString()} has been approved and will be processed.` },
    REJECT: { title: "Withdrawal rejected", body: `Your withdrawal of ETB ${result.amount.toString()} was rejected${input.reason ? `: ${input.reason}` : "."} The funds have been returned to your available balance.` },
    MARK_COMPLETED: { title: "Withdrawal completed", body: `Your withdrawal of ETB ${result.amount.toString()} has been sent to ${maskDestination(result.destinationAccount)}.` },
    CANCEL: { title: "Withdrawal cancelled", body: `Your withdrawal of ETB ${result.amount.toString()} was cancelled. The funds have been returned to your available balance.` },
  };
  const copy = notifyCopy[input.action];
  if (copy) {
    await notifyUser({ userId: result.userId, type: `WITHDRAWAL_${input.action}`, title: copy.title, body: copy.body });
  }

  return result;
}

export function maskDestination(destination: string): string {
  if (destination.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, destination.length - 4))}${destination.slice(-4)}`;
}

export interface WithdrawalFilters {
  status?: WithdrawalStatus;
  userId?: string;
  from?: Date;
  to?: Date;
  minAmount?: number;
  maxAmount?: number;
  provider?: PaymentProviderType;
}

export async function listWithdrawals(filters: WithdrawalFilters, page: number, pageSize: number) {
  const where: Prisma.WithdrawalWhereInput = {
    status: filters.status,
    userId: filters.userId,
    provider: filters.provider,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    amount:
      filters.minAmount !== undefined || filters.maxAmount !== undefined
        ? { gte: filters.minAmount, lte: filters.maxAmount }
        : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, fullName: true, username: true, phone: true } } },
    }),
    prisma.withdrawal.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getWithdrawalAdminSummary() {
  const grouped = await prisma.withdrawal.groupBy({
    by: ["status"],
    _sum: { amount: true },
    _count: true,
  });

  const summary = {
    pendingCount: 0,
    pendingTotal: new Prisma.Decimal(0),
    approvedTotal: new Prisma.Decimal(0),
    paidTotal: new Prisma.Decimal(0),
    rejectedTotal: new Prisma.Decimal(0),
  };

  for (const row of grouped) {
    const sum = row._sum.amount ?? new Prisma.Decimal(0);
    if (row.status === "REQUESTED" || row.status === "UNDER_REVIEW") {
      summary.pendingCount += row._count;
      summary.pendingTotal = summary.pendingTotal.plus(sum);
    } else if (row.status === "APPROVED" || row.status === "PROCESSING") {
      summary.approvedTotal = summary.approvedTotal.plus(sum);
    } else if (row.status === "COMPLETED") {
      summary.paidTotal = summary.paidTotal.plus(sum);
    } else if (row.status === "REJECTED") {
      summary.rejectedTotal = summary.rejectedTotal.plus(sum);
    }
  }

  return summary;
}
