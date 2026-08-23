import { Prisma, prisma } from "@bingo/db";
import { ResponsibleGamingLimitError, SelfExclusionActiveError, ValidationError } from "./errors";
import { writeAuditLog } from "./audit";

const INCREASE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_COOLING_OFF_HOURS = 24;
const MAX_COOLING_OFF_HOURS = 24 * 30;
const MIN_SELF_EXCLUSION_DAYS = 30;
const MAX_SELF_EXCLUSION_DAYS = 365 * 5;

export interface EffectiveLimits {
  dailyDepositLimit: Prisma.Decimal | null;
  weeklyDepositLimit: Prisma.Decimal | null;
  dailySpendLimit: Prisma.Decimal | null;
  weeklySpendLimit: Prisma.Decimal | null;
  pendingIncreaseEffectiveAt: Date | null;
  coolingOffUntil: Date | null;
  selfExcludedUntil: Date | null;
}

/**
 * Resolves the limit row a user actually has in force right now, applying
 * any pending increase whose 24h cool-down has elapsed. Read-only — the
 * actual promotion of pending->active values happens the next time the
 * user calls updateLimits() or here lazily via a write-back, whichever
 * comes first; reads never block on a write.
 */
export async function getEffectiveLimits(userId: string): Promise<EffectiveLimits> {
  const row = await prisma.responsibleGamingLimit.findUnique({ where: { userId } });
  if (!row) {
    return {
      dailyDepositLimit: null,
      weeklyDepositLimit: null,
      dailySpendLimit: null,
      weeklySpendLimit: null,
      pendingIncreaseEffectiveAt: null,
      coolingOffUntil: null,
      selfExcludedUntil: null,
    };
  }

  const increaseIsDue = row.pendingIncreaseEffectiveAt !== null && row.pendingIncreaseEffectiveAt <= new Date();
  if (increaseIsDue) {
    const promoted = await prisma.responsibleGamingLimit.update({
      where: { userId },
      data: {
        dailyDepositLimit: row.pendingDailyDepositLimit,
        weeklyDepositLimit: row.pendingWeeklyDepositLimit,
        dailySpendLimit: row.pendingDailySpendLimit,
        weeklySpendLimit: row.pendingWeeklySpendLimit,
        pendingIncreaseEffectiveAt: null,
        pendingDailyDepositLimit: null,
        pendingWeeklyDepositLimit: null,
        pendingDailySpendLimit: null,
        pendingWeeklySpendLimit: null,
      },
    });
    return {
      dailyDepositLimit: promoted.dailyDepositLimit,
      weeklyDepositLimit: promoted.weeklyDepositLimit,
      dailySpendLimit: promoted.dailySpendLimit,
      weeklySpendLimit: promoted.weeklySpendLimit,
      pendingIncreaseEffectiveAt: null,
      coolingOffUntil: promoted.coolingOffUntil,
      selfExcludedUntil: promoted.selfExcludedUntil,
    };
  }

  return {
    dailyDepositLimit: row.dailyDepositLimit,
    weeklyDepositLimit: row.weeklyDepositLimit,
    dailySpendLimit: row.dailySpendLimit,
    weeklySpendLimit: row.weeklySpendLimit,
    pendingIncreaseEffectiveAt: row.pendingIncreaseEffectiveAt,
    coolingOffUntil: row.coolingOffUntil,
    selfExcludedUntil: row.selfExcludedUntil,
  };
}

/** Throws if the user is currently in a cooling-off or self-exclusion period. Call before ANY deposit or ticket purchase. */
export async function assertNotExcluded(userId: string): Promise<void> {
  const limits = await getEffectiveLimits(userId);
  const now = new Date();
  if (limits.selfExcludedUntil && limits.selfExcludedUntil > now) {
    throw new SelfExclusionActiveError(
      `Your account is self-excluded until ${limits.selfExcludedUntil.toISOString().slice(0, 10)}. Contact support if you believe this is an error.`,
    );
  }
  if (limits.coolingOffUntil && limits.coolingOffUntil > now) {
    throw new SelfExclusionActiveError(`You're in a cooling-off period until ${limits.coolingOffUntil.toISOString().slice(0, 10)}. This cannot be cancelled early.`);
  }
}

async function windowSpend(userId: string, type: "DEPOSIT" | "TICKET_PURCHASE", hours: number): Promise<Prisma.Decimal> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const agg = await prisma.walletTransaction.aggregate({
    where: { userId, type, status: { in: ["COMPLETED", "PENDING"] }, createdAt: { gte: since } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? new Prisma.Decimal(0);
}

/** Throws ResponsibleGamingLimitError if `amount` would push the user's deposit total over their daily/weekly limit. Call before creating a deposit. */
export async function assertWithinDepositLimit(userId: string, amount: Prisma.Decimal): Promise<void> {
  await assertNotExcluded(userId);
  const limits = await getEffectiveLimits(userId);
  if (limits.dailyDepositLimit) {
    const spent = await windowSpend(userId, "DEPOSIT", 24);
    if (spent.plus(amount).gt(limits.dailyDepositLimit)) {
      throw new ResponsibleGamingLimitError(`This deposit would exceed your daily deposit limit of ETB ${limits.dailyDepositLimit}. You've deposited ETB ${spent} in the last 24 hours.`);
    }
  }
  if (limits.weeklyDepositLimit) {
    const spent = await windowSpend(userId, "DEPOSIT", 24 * 7);
    if (spent.plus(amount).gt(limits.weeklyDepositLimit)) {
      throw new ResponsibleGamingLimitError(`This deposit would exceed your weekly deposit limit of ETB ${limits.weeklyDepositLimit}. You've deposited ETB ${spent} in the last 7 days.`);
    }
  }
}

/** Throws ResponsibleGamingLimitError if `amount` would push the user's ticket spend over their daily/weekly limit. Call before purchaseTickets(). */
export async function assertWithinSpendLimit(userId: string, amount: Prisma.Decimal): Promise<void> {
  await assertNotExcluded(userId);
  const limits = await getEffectiveLimits(userId);
  if (limits.dailySpendLimit) {
    const spent = await windowSpend(userId, "TICKET_PURCHASE", 24);
    if (spent.plus(amount).gt(limits.dailySpendLimit)) {
      throw new ResponsibleGamingLimitError(`This purchase would exceed your daily spending limit of ETB ${limits.dailySpendLimit}. You've spent ETB ${spent} in the last 24 hours.`);
    }
  }
  if (limits.weeklySpendLimit) {
    const spent = await windowSpend(userId, "TICKET_PURCHASE", 24 * 7);
    if (spent.plus(amount).gt(limits.weeklySpendLimit)) {
      throw new ResponsibleGamingLimitError(`This purchase would exceed your weekly spending limit of ETB ${limits.weeklySpendLimit}. You've spent ETB ${spent} in the last 7 days.`);
    }
  }
}

export interface LimitUpdateInput {
  dailyDepositLimit?: number | null;
  weeklyDepositLimit?: number | null;
  dailySpendLimit?: number | null;
  weeklySpendLimit?: number | null;
}

/**
 * Applies a limit change. Any value that is LOWER than (or newly sets) the
 * current limit takes effect immediately. Any value that is HIGHER, or
 * clears a limit entirely (null), is staged as "pending" and only takes
 * effect 24h later — read by getEffectiveLimits()/assert*() on their next
 * call after the cool-down elapses. This is the core anti-abuse property:
 * a player mid-session cannot raise their own limit to keep spending.
 */
interface FieldPlan {
  immediateValue: Prisma.Decimal | null;
  immediateChanged: boolean;
  pendingValue: Prisma.Decimal | null;
  pendingChanged: boolean;
}

/** A decrease (or setting a limit where none existed) applies now; a raise or a clear-to-null is staged. */
function planField(raw: number | null | undefined, currentVal: Prisma.Decimal | null): FieldPlan {
  if (raw === undefined) return { immediateValue: currentVal, immediateChanged: false, pendingValue: null, pendingChanged: false };
  const next = raw === null ? null : new Prisma.Decimal(raw);
  const isDecreaseOrNewLimit = next !== null && (currentVal === null || next.lt(currentVal));
  if (isDecreaseOrNewLimit) {
    return { immediateValue: next, immediateChanged: true, pendingValue: null, pendingChanged: false };
  }
  const unchanged = next === null ? currentVal === null : currentVal !== null && next.eq(currentVal);
  if (unchanged) return { immediateValue: currentVal, immediateChanged: false, pendingValue: null, pendingChanged: false };
  return { immediateValue: currentVal, immediateChanged: false, pendingValue: next, pendingChanged: true };
}

export async function updateLimits(userId: string, input: LimitUpdateInput, actorUserId: string): Promise<void> {
  const existing = await prisma.responsibleGamingLimit.findUnique({ where: { userId } });
  const current = {
    dailyDepositLimit: existing?.dailyDepositLimit ?? null,
    weeklyDepositLimit: existing?.weeklyDepositLimit ?? null,
    dailySpendLimit: existing?.dailySpendLimit ?? null,
    weeklySpendLimit: existing?.weeklySpendLimit ?? null,
  };
  for (const [key, raw] of Object.entries(input)) {
    if (raw !== null && raw !== undefined && raw <= 0) throw new ValidationError(`${key} must be a positive amount, or null to remove it.`);
  }

  const daily = planField(input.dailyDepositLimit, current.dailyDepositLimit);
  const weekly = planField(input.weeklyDepositLimit, current.weeklyDepositLimit);
  const dailySpend = planField(input.dailySpendLimit, current.dailySpendLimit);
  const weeklySpend = planField(input.weeklySpendLimit, current.weeklySpendLimit);
  const hasPending = daily.pendingChanged || weekly.pendingChanged || dailySpend.pendingChanged || weeklySpend.pendingChanged;
  const effectiveAt = hasPending ? new Date(Date.now() + INCREASE_COOLDOWN_MS) : undefined;

  const writeData = {
    dailyDepositLimit: daily.immediateValue,
    weeklyDepositLimit: weekly.immediateValue,
    dailySpendLimit: dailySpend.immediateValue,
    weeklySpendLimit: weeklySpend.immediateValue,
    ...(daily.pendingChanged ? { pendingDailyDepositLimit: daily.pendingValue } : {}),
    ...(weekly.pendingChanged ? { pendingWeeklyDepositLimit: weekly.pendingValue } : {}),
    ...(dailySpend.pendingChanged ? { pendingDailySpendLimit: dailySpend.pendingValue } : {}),
    ...(weeklySpend.pendingChanged ? { pendingWeeklySpendLimit: weeklySpend.pendingValue } : {}),
    ...(effectiveAt ? { pendingIncreaseEffectiveAt: effectiveAt } : {}),
  };

  await prisma.responsibleGamingLimit.upsert({
    where: { userId },
    create: { userId, ...writeData },
    update: writeData,
  });

  await writeAuditLog({
    actorUserId,
    action: "RESPONSIBLE_GAMING_LIMITS_UPDATED",
    entityType: "User",
    entityId: userId,
    oldValue: JSON.parse(JSON.stringify(current)),
    newValue: JSON.parse(JSON.stringify(input)),
  });
}

/** Starts a cooling-off period. Self-service, cannot be cancelled early by the player. */
export async function startCoolingOff(userId: string, hours: number): Promise<Date> {
  if (hours < MIN_COOLING_OFF_HOURS || hours > MAX_COOLING_OFF_HOURS) {
    throw new ValidationError(`Cooling-off period must be between ${MIN_COOLING_OFF_HOURS} hours and ${MAX_COOLING_OFF_HOURS / 24} days.`);
  }
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.responsibleGamingLimit.upsert({
    where: { userId },
    create: { userId, coolingOffUntil: until },
    update: { coolingOffUntil: until },
  });
  await writeAuditLog({ actorUserId: userId, action: "COOLING_OFF_STARTED", entityType: "User", entityId: userId, newValue: { until: until.toISOString() } });
  return until;
}

/** Starts self-exclusion. Longer than cooling-off, and lifting it early requires support/an admin action, never a player-facing endpoint. */
export async function startSelfExclusion(userId: string, days: number): Promise<Date> {
  if (days < MIN_SELF_EXCLUSION_DAYS || days > MAX_SELF_EXCLUSION_DAYS) {
    throw new ValidationError(`Self-exclusion must be between ${MIN_SELF_EXCLUSION_DAYS} and ${MAX_SELF_EXCLUSION_DAYS} days.`);
  }
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.responsibleGamingLimit.upsert({
    where: { userId },
    create: { userId, selfExcludedUntil: until, selfExcludedAt: new Date() },
    update: { selfExcludedUntil: until, selfExcludedAt: new Date() },
  });
  await writeAuditLog({ actorUserId: userId, action: "SELF_EXCLUSION_STARTED", entityType: "User", entityId: userId, newValue: { until: until.toISOString() } });
  return until;
}

/** Admin-only early lift of a self-exclusion — never exposed to a player-facing endpoint. */
export async function adminLiftSelfExclusion(userId: string, actorUserId: string, reason: string): Promise<void> {
  await prisma.responsibleGamingLimit.updateMany({ where: { userId }, data: { selfExcludedUntil: null } });
  await writeAuditLog({ actorUserId, action: "SELF_EXCLUSION_LIFTED_BY_ADMIN", entityType: "User", entityId: userId, newValue: { reason } });
}
