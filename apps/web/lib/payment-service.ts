import { randomUUID } from "node:crypto";
import { Prisma, prisma, type Payment, type PaymentProviderType } from "@bingo/db";
import {
  getPaymentProvider,
  ProviderNotConfiguredError,
  type CallbackRequest,
  type NormalizedPaymentStatus,
  type VerificationResult,
} from "@bingo/payments";
import { ConflictError, MaintenanceModeError, ValidationError } from "./errors";
import { applyWalletTransaction } from "./wallet-service";
import { writeAuditLog } from "./audit";
import { notifyUser } from "./notifications";
import { getSystemSetting, isMaintenanceModeEnabled } from "./system-settings";
import { getEnv } from "./env";
import { assertWithinDepositLimit } from "./responsible-gaming-service";

const MIN_DEPOSIT_DEFAULT = 20;
const MAX_DEPOSIT_DEFAULT = 50000;

export async function getDepositLimits() {
  const [min, max] = await Promise.all([
    getSystemSetting("deposit.min", MIN_DEPOSIT_DEFAULT),
    getSystemSetting("deposit.max", MAX_DEPOSIT_DEFAULT),
  ]);
  return { min, max };
}

/** MOCK is only ever usable outside production, and only when explicitly enabled. */
export function isMockProviderAvailable(): boolean {
  const env = getEnv();
  return env.NODE_ENV !== "production" && env.ENABLE_MOCK_PAYMENTS;
}

export async function createDeposit(input: {
  userId: string;
  provider: PaymentProviderType;
  amount: number;
}): Promise<Payment> {
  if (input.provider === "MOCK" && !isMockProviderAvailable()) {
    throw new ValidationError("Mock payments are disabled in this environment.");
  }
  // New deposits are paused during maintenance; callback processing for
  // already-initiated payments is deliberately NOT gated here so an
  // in-flight payment a player already started can still complete/be
  // reconciled correctly.
  if (await isMaintenanceModeEnabled()) throw new MaintenanceModeError("Deposits are paused during maintenance. Please try again shortly.");

  // Self-exclusion/cooling-off and self-imposed deposit limits are
  // enforced server-side — never trust a client to respect its own limits.
  await assertWithinDepositLimit(input.userId, new Prisma.Decimal(input.amount));

  const { min, max } = await getDepositLimits();
  if (input.amount < min || input.amount > max) {
    throw new ValidationError(`Deposit amount must be between ETB ${min} and ETB ${max}.`);
  }

  const provider = getPaymentProvider(input.provider);
  if (!provider.isConfigured) {
    throw new ProviderNotConfiguredError(input.provider);
  }

  const amount = new Prisma.Decimal(input.amount);
  const idempotencyKey = `deposit:${input.userId}:${randomUUID()}`;

  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      amount,
      status: "INITIATED",
      idempotencyKey,
    },
  });

  await writeAuditLog({
    actorUserId: input.userId,
    action: "PAYMENT_CREATED",
    entityType: "Payment",
    entityId: payment.id,
    newValue: { provider: input.provider, amount: input.amount },
  });

  const env = getEnv();
  try {
    const order = await provider.createOrder({
      paymentId: payment.id,
      userId: input.userId,
      amount,
      currency: payment.currency,
      notifyUrl: `${env.APP_URL}/api/payments/${input.provider.toLowerCase()}/callback`,
    });

    return await prisma.payment.update({
      where: { id: payment.id },
      data: { providerOrderId: order.providerOrderId, status: "PENDING" },
    });
  } catch (err) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: err instanceof Error ? err.message : "Unknown error creating order" },
    });
    throw err;
  }
}

const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILED", "CANCELLED", "EXPIRED", "REVERSED"]);

function normalizedToPaymentStatus(status: NormalizedPaymentStatus) {
  return status; // NormalizedPaymentStatus values are a subset of PaymentStatus and share spelling.
}

export interface CallbackProcessingResult {
  ok: boolean;
  duplicate?: boolean;
  reason?: string;
  paymentId?: string;
}

/**
 * The full inbound-webhook pipeline described in docs/ARCHITECTURE.md:
 * validate → verify signature → log the raw delivery → check idempotency →
 * independently re-verify with the provider → atomically transition the
 * payment exactly once → credit the wallet → notify. No step after
 * "verify signature" trusts the callback body's claimed status without the
 * independent `verifyTransaction` call.
 */
export async function processPaymentCallback(
  providerName: PaymentProviderType,
  req: CallbackRequest,
): Promise<CallbackProcessingResult> {
  const provider = getPaymentProvider(providerName);

  let signatureValid = false;
  try {
    signatureValid = provider.isCallbackSignatureValid(req);
  } catch {
    signatureValid = false;
  }

  let parsed: ReturnType<typeof provider.parseCallback> | undefined;
  try {
    parsed = provider.parseCallback(req);
  } catch {
    parsed = undefined;
  }

  // Log the raw delivery immediately — before any decision is made — so
  // every callback attempt (valid or not) is forensically recoverable.
  const log = await prisma.paymentCallbackLog.create({
    data: {
      provider: providerName,
      providerTxnId: parsed?.providerTransactionId,
      providerEventId: parsed?.providerEventId,
      signatureValid,
      rawPayload: safeJson(req.rawBody),
      processedResult: "RECEIVED",
    },
  });

  const finalize = (processedResult: string, errorMessage?: string, paymentId?: string) =>
    prisma.paymentCallbackLog.update({
      where: { id: log.id },
      data: { processedResult, errorMessage, processedAt: new Date(), paymentId },
    });

  if (!signatureValid) {
    await finalize("REJECTED_BAD_SIGNATURE", "Callback signature verification failed.");
    return { ok: false, reason: "invalid_signature" };
  }
  if (!parsed) {
    await finalize("ERROR", "Callback payload could not be parsed.");
    return { ok: false, reason: "unparseable_payload" };
  }

  const payment = await prisma.payment.findFirst({
    where: { provider: providerName, providerOrderId: parsed.providerOrderId },
  });
  if (!payment) {
    await finalize("REJECTED_UNKNOWN_PAYMENT", `No payment found for providerOrderId ${parsed.providerOrderId}.`);
    return { ok: false, reason: "unknown_payment" };
  }

  if (parsed.amount && !parsed.amount.equals(payment.amount)) {
    await finalize(
      "REJECTED_TAMPERED",
      `Callback amount ${parsed.amount.toString()} does not match payment amount ${payment.amount.toString()}.`,
      payment.id,
    );
    await writeAuditLog({
      action: "PAYMENT_CALLBACK_TAMPER_DETECTED",
      entityType: "Payment",
      entityId: payment.id,
      newValue: { claimedAmount: parsed.amount.toString(), actualAmount: payment.amount.toString() },
    });
    return { ok: false, reason: "amount_mismatch", paymentId: payment.id };
  }

  if (TERMINAL_STATUSES.has(payment.status)) {
    await finalize("DUPLICATE_IGNORED", undefined, payment.id);
    return { ok: true, duplicate: true, paymentId: payment.id };
  }

  // Never trust the callback's claimed status alone — independently confirm
  // with the provider before crediting anything.
  let verification: VerificationResult;
  try {
    verification = await provider.verifyTransaction(parsed.providerOrderId);
  } catch (err) {
    await markPendingReconciliation(payment, err);
    await finalize(
      "REJECTED_VERIFICATION_FAILED",
      err instanceof Error ? err.message : "Provider verification call failed.",
      payment.id,
    );
    return { ok: false, reason: "verification_failed", paymentId: payment.id };
  }

  const result = await applyVerifiedOutcome(payment, verification, req.rawBody);
  await finalize(result.duplicate ? "DUPLICATE_IGNORED" : "APPLIED", undefined, payment.id);
  return { ok: true, duplicate: result.duplicate, paymentId: payment.id };
}

/**
 * Marks a payment as needing human/scheduled reconciliation because the
 * provider's verification call itself failed (timeout, network error,
 * unparseable response) — this is deliberately NOT the same as FAILED.
 * We do not know what happened; assuming failure here is exactly the bug
 * that causes double-charges (customer paid, we assume failure, customer
 * retries). The payment stays non-terminal so reconciliation can still
 * resolve it correctly once the provider is reachable again.
 */
async function markPendingReconciliation(payment: Payment, err: unknown): Promise<void> {
  const updateResult = await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ["INITIATED", "PENDING"] } },
    data: {
      status: "PENDING_RECONCILIATION",
      failureReason: err instanceof Error ? err.message : "Provider verification failed",
    },
  });
  if (updateResult.count > 0) {
    await writeAuditLog({
      actorUserId: payment.userId,
      action: "PAYMENT_MARKED_PENDING_RECONCILIATION",
      entityType: "Payment",
      entityId: payment.id,
      oldValue: { status: payment.status },
      newValue: { status: "PENDING_RECONCILIATION", reason: err instanceof Error ? err.message : String(err) },
    });
  }
}

/**
 * Atomically transitions a payment to a verified terminal status and, on
 * SUCCESS, credits the wallet exactly once. Shared by the callback pipeline
 * and manual/scheduled reconciliation so both paths have identical
 * exactly-once guarantees.
 */
async function applyVerifiedOutcome(
  payment: Payment,
  verification: VerificationResult,
  rawPayload?: string,
): Promise<{ duplicate: boolean }> {
  if (verification.status === "PENDING") {
    // Nothing to finalize yet; leave the payment as-is.
    return { duplicate: true };
  }

  const newStatus = normalizedToPaymentStatus(verification.status);

  // Conditional update: only succeeds if the payment is still non-terminal
  // (including PENDING_RECONCILIATION — a payment that once had an
  // ambiguous provider response can still resolve correctly once
  // reconciliation gets a clear answer). This is the concurrency guard —
  // under N simultaneous callers, exactly one `updateMany` call has
  // count === 1; every other one is a no-op.
  const updateResult = await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ["INITIATED", "PENDING", "PENDING_RECONCILIATION"] } },
    data: {
      status: newStatus,
      providerTransactionId: verification.providerTransactionId,
      verifiedAt: new Date(),
      callbackReceivedAt: new Date(),
      callbackPayloadRaw: rawPayload ? safeJson(rawPayload) : undefined,
      failureReason: newStatus === "FAILED" ? "Provider reported failure." : undefined,
    },
  });

  if (updateResult.count === 0) {
    // Someone else (another concurrent callback, or a reconciliation run)
    // already finalized this payment.
    return { duplicate: true };
  }

  if (newStatus === "SUCCESS") {
    const walletTx = await applyWalletTransaction({
      userId: payment.userId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: payment.amount.toString(),
      referenceId: `payment:${payment.id}`,
      provider: payment.provider,
      providerTransactionId: verification.providerTransactionId,
      relatedPaymentId: payment.id,
    });

    await writeAuditLog({
      actorUserId: payment.userId,
      action: "PAYMENT_COMPLETED",
      entityType: "Payment",
      entityId: payment.id,
      newValue: { status: "SUCCESS", walletTransactionId: walletTx.id },
    });

    await notifyUser({
      userId: payment.userId,
      type: "DEPOSIT_SUCCESS",
      title: "Deposit successful",
      body: `Your deposit of ETB ${payment.amount.toString()} has been credited to your wallet.`,
    });
  } else {
    await writeAuditLog({
      actorUserId: payment.userId,
      action: "PAYMENT_FAILED",
      entityType: "Payment",
      entityId: payment.id,
      newValue: { status: newStatus },
    });

    await notifyUser({
      userId: payment.userId,
      type: "DEPOSIT_FAILED",
      title: "Deposit not completed",
      body: `Your deposit of ETB ${payment.amount.toString()} was ${newStatus.toLowerCase()}. No funds were charged to your wallet.`,
    });
  }

  return { duplicate: false };
}

/**
 * Server-initiated reconciliation: independently asks the provider for the
 * current status of a payment and applies the same exactly-once logic as
 * the callback pipeline. Used for payments stuck in PENDING/INITIATED past
 * a threshold, or by an admin investigating a specific payment.
 */
export async function reconcilePayment(paymentId: string, actorUserId: string): Promise<{ status: string; changed: boolean }> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new ConflictError("Payment not found.");
  if (!payment.providerOrderId) throw new ConflictError("Payment has no provider order to reconcile against.");

  if (TERMINAL_STATUSES.has(payment.status)) {
    return { status: payment.status, changed: false };
  }

  const provider = getPaymentProvider(payment.provider);
  const before = payment.status;

  let verification: VerificationResult;
  try {
    verification = await provider.verifyTransaction(payment.providerOrderId);
  } catch (err) {
    await markPendingReconciliation(payment, err);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return { status: updated.status, changed: before !== updated.status };
  }

  const result = await applyVerifiedOutcome(payment, verification);

  await writeAuditLog({
    actorUserId,
    action: "PAYMENT_RECONCILED",
    entityType: "Payment",
    entityId: payment.id,
    oldValue: { status: before },
    newValue: { status: verification.status, applied: !result.duplicate },
  });

  const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { status: updated.status, changed: before !== updated.status };
}

function safeJson(rawBody: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { unparseable: true, raw: rawBody.slice(0, 2000) };
  }
}
