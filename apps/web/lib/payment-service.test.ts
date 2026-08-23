import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Must be set before the mock provider singleton is first constructed.
process.env.MOCK_PAYMENT_WEBHOOK_SECRET = "integration-test-secret";
process.env.ENABLE_MOCK_PAYMENTS = "true";

import { prisma } from "@bingo/db";
import { getMockPaymentProvider } from "@bingo/payments";
import { createDeposit, processPaymentCallback, reconcilePayment } from "./payment-service";

// Integration test — requires a real Postgres reachable via DATABASE_URL.
// Creates and tears down its own test user; exercises the full callback
// pipeline (signature → log → idempotency → verify → credit) exactly as
// the real HTTP routes do, just calling the service functions directly.

let userId: string;
const provider = getMockPaymentProvider();

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: "Payment Test User",
      username: `payment_test_${suffix}`,
      email: `payment_test_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "1").padEnd(8, "1").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `PT${suffix.toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: { availableBalance: 0, pendingBalance: 0 } },
    },
  });
  userId = user.id;
});

afterAll(async () => {
  const payments = await prisma.payment.findMany({ where: { userId }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  await prisma.paymentCallbackLog.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.walletTransaction.deleteMany({ where: { userId } });
  await prisma.payment.deleteMany({ where: { userId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

async function makeDeposit(amount: number) {
  const payment = await createDeposit({ userId, provider: "MOCK", amount });
  return payment;
}

async function getWalletBalance() {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return wallet.availableBalance.toString();
}

describe("payment lifecycle outcomes", () => {
  it("SUCCESS credits the wallet exactly once with a DEPOSIT ledger row", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(500);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");
    const result = await processPaymentCallback("MOCK", callback);

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBeFalsy();

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("SUCCESS");
    expect(updated.providerTransactionId).toBeTruthy();

    const walletTx = await prisma.walletTransaction.findUnique({ where: { referenceId: `payment:${payment.id}` } });
    expect(walletTx).not.toBeNull();
    expect(walletTx!.type).toBe("DEPOSIT");
    expect(walletTx!.amount.toString()).toBe("500");

    const after = await getWalletBalance();
    expect(Number(after)).toBe(Number(before) + 500);
  });

  it("FAILED does not touch the wallet", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(50);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "FAILED");
    await processPaymentCallback("MOCK", callback);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("FAILED");
    expect(await getWalletBalance()).toBe(before);
  });

  it("CANCELLED does not touch the wallet", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(50);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "CANCELLED");
    await processPaymentCallback("MOCK", callback);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("CANCELLED");
    expect(await getWalletBalance()).toBe(before);
  });

  it("EXPIRED does not touch the wallet", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(50);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "EXPIRED");
    await processPaymentCallback("MOCK", callback);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("EXPIRED");
    expect(await getWalletBalance()).toBe(before);
  });

  it("PENDING leaves the payment open and does not touch the wallet", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(50);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "PENDING");
    const result = await processPaymentCallback("MOCK", callback);

    expect(result.duplicate).toBe(true); // nothing finalized
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
    expect(await getWalletBalance()).toBe(before);
  });
});

describe("idempotency and replay protection", () => {
  it("an exact byte-for-byte replay of the same callback is applied exactly once", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(300);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");

    const first = await processPaymentCallback("MOCK", callback);
    const second = await processPaymentCallback("MOCK", callback);
    const third = await processPaymentCallback("MOCK", callback);

    expect(first.duplicate).toBeFalsy();
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);

    const txCount = await prisma.walletTransaction.count({ where: { relatedPaymentId: payment.id } });
    expect(txCount).toBe(1);
    expect(Number(await getWalletBalance())).toBe(Number(before) + 300);
  });

  it("20 concurrent identical SUCCESS callbacks result in exactly one credit", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(77);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");

    const results = await Promise.all(Array.from({ length: 20 }, () => processPaymentCallback("MOCK", callback)));

    const applied = results.filter((r) => r.ok && !r.duplicate);
    const duplicates = results.filter((r) => r.ok && r.duplicate);
    expect(applied.length).toBe(1);
    expect(duplicates.length).toBe(19);

    const txCount = await prisma.walletTransaction.count({ where: { relatedPaymentId: payment.id } });
    expect(txCount).toBe(1);
    expect(Number(await getWalletBalance())).toBe(Number(before) + 77);

    // Every delivery is still forensically logged, even the 19 duplicates.
    const logCount = await prisma.paymentCallbackLog.count({ where: { paymentId: payment.id } });
    expect(logCount).toBe(20);
    const appliedLogs = await prisma.paymentCallbackLog.count({ where: { paymentId: payment.id, processedResult: "APPLIED" } });
    expect(appliedLogs).toBe(1);
  });

  it("a later callback cannot overturn an already-terminal payment", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(40);
    await processPaymentCallback("MOCK", provider.simulateOutcome(payment.providerOrderId!, "SUCCESS"));
    // A confused/late retry claiming FAILED after we already paid out.
    const lateCallback = provider.simulateOutcome(payment.providerOrderId!, "FAILED");
    const result = await processPaymentCallback("MOCK", lateCallback);

    expect(result.duplicate).toBe(true);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("SUCCESS");
    expect(Number(await getWalletBalance())).toBe(Number(before) + 40);
  });
});

describe("callback security", () => {
  it("rejects a callback with no signature header", async () => {
    const payment = await makeDeposit(50);
    const { rawBody } = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");
    const result = await processPaymentCallback("MOCK", { rawBody, headers: {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_signature");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).not.toBe("SUCCESS");
  });

  it("rejects a callback with a forged signature", async () => {
    const payment = await makeDeposit(50);
    const { rawBody } = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");
    const forgedSignature = createHmac("sha256", "wrong-secret").update(rawBody).digest("hex");
    const result = await processPaymentCallback("MOCK", { rawBody, headers: { "x-mock-signature": forgedSignature } });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_signature");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).not.toBe("SUCCESS");
  });

  it("rejects malformed JSON even when correctly signed over those exact bytes", async () => {
    const garbage = "{not valid json";
    const signature = createHmac("sha256", "integration-test-secret").update(garbage).digest("hex");
    const result = await processPaymentCallback("MOCK", { rawBody: garbage, headers: { "x-mock-signature": signature } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unparseable_payload");
  });

  it("rejects a callback for a providerOrderId that doesn't exist", async () => {
    const fake = provider.buildSignedCallback({
      providerOrderId: "mock_ord_does_not_exist",
      providerTransactionId: "mock_txn_fake",
      providerEventId: randomUUID(),
      status: "SUCCESS",
      amount: "999",
      userId: "irrelevant",
    });
    const result = await processPaymentCallback("MOCK", fake);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown_payment");
  });

  it("rejects a callback whose amount doesn't match the payment (tamper detection)", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(100);
    const legit = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");
    const tampered = { ...legit, rawBody: legit.rawBody.replace('"amount":"100"', '"amount":"100000"') };
    // Re-sign over the tampered body using a leaked/guessed secret to prove
    // that amount validation, not just signature validation, is enforced —
    // in real life an attacker who somehow forged a valid signature over a
    // tampered amount must still be caught here.
    const resigned = {
      rawBody: tampered.rawBody,
      headers: { "x-mock-signature": createHmac("sha256", "integration-test-secret").update(tampered.rawBody).digest("hex") },
    };

    const result = await processPaymentCallback("MOCK", resigned);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("amount_mismatch");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).not.toBe("SUCCESS");
    expect(await getWalletBalance()).toBe(before);
  });

  it("ignores a userId claimed in the callback payload — the credited user always comes from our own Payment record", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(60);
    const callback = provider.buildSignedCallback({
      providerOrderId: payment.providerOrderId!,
      providerTransactionId: `mock_txn_${randomUUID()}`,
      providerEventId: randomUUID(),
      status: "SUCCESS",
      amount: "60",
      userId: "some-other-user-id-entirely",
    });
    // Also flip the order's internal state so verifyTransaction reports SUCCESS.
    provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");

    await processPaymentCallback("MOCK", callback);
    const walletTx = await prisma.walletTransaction.findUnique({ where: { referenceId: `payment:${payment.id}` } });
    expect(walletTx?.userId).toBe(userId);
    expect(Number(await getWalletBalance())).toBe(Number(before) + 60);
  });

  it("marks the payment PENDING_RECONCILIATION (never FAILED) when provider verification errors — ambiguity must never be assumed to mean failure", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(50);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");
    provider.forceVerificationFailure(payment.providerOrderId!);

    const result = await processPaymentCallback("MOCK", callback);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("verification_failed");
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("PENDING_RECONCILIATION");
    expect(updated.status).not.toBe("FAILED");
    expect(await getWalletBalance()).toBe(before);
  });

  it("a payment left PENDING_RECONCILIATION can still resolve correctly once the provider becomes reachable again", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(90);
    const callback = provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");
    provider.forceVerificationFailure(payment.providerOrderId!);

    await processPaymentCallback("MOCK", callback);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING_RECONCILIATION");

    // Provider is reachable again for the reconciliation retry — note we
    // never re-signal via forceVerificationFailure again, so this call
    // succeeds and should resolve the payment correctly.
    const result = await reconcilePayment(payment.id, userId);
    expect(result.status).toBe("SUCCESS");
    expect(Number(await getWalletBalance())).toBe(Number(before) + 90);
  });
});

describe("invalid state transitions are structurally impossible", () => {
  it("a callback cannot move a FAILED payment to SUCCESS", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(35);
    await processPaymentCallback("MOCK", provider.simulateOutcome(payment.providerOrderId!, "FAILED"));
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");

    // Someone (a confused retry, or an attacker) tries to push it to SUCCESS.
    const result = await processPaymentCallback("MOCK", provider.simulateOutcome(payment.providerOrderId!, "SUCCESS"));
    expect(result.duplicate).toBe(true);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");
    expect(await getWalletBalance()).toBe(before);
  });

  it("reconciliation cannot move a terminal FAILED payment to SUCCESS", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(45);
    await processPaymentCallback("MOCK", provider.simulateOutcome(payment.providerOrderId!, "FAILED"));
    // Provider-side state now (implausibly) reports SUCCESS — reconciliation
    // must still refuse to reopen an already-terminal payment.
    provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");

    const result = await reconcilePayment(payment.id, userId);
    expect(result.changed).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(await getWalletBalance()).toBe(before);
  });

  it("reconciliation cannot move a terminal CANCELLED payment at all", async () => {
    const payment = await makeDeposit(25);
    await processPaymentCallback("MOCK", provider.simulateOutcome(payment.providerOrderId!, "CANCELLED"));
    const result = await reconcilePayment(payment.id, userId);
    expect(result.changed).toBe(false);
    expect(result.status).toBe("CANCELLED");
  });
});

describe("reconciliation", () => {
  it("reconciling a PENDING payment against a since-completed provider order credits the wallet exactly once", async () => {
    const before = await getWalletBalance();
    const payment = await makeDeposit(120);
    // Provider-side state moves to SUCCESS (e.g. the callback never arrived) —
    // reconciliation should catch this independently.
    provider.simulateOutcome(payment.providerOrderId!, "SUCCESS");

    const result = await reconcilePayment(payment.id, userId);
    expect(result.status).toBe("SUCCESS");
    expect(result.changed).toBe(true);

    const txCount = await prisma.walletTransaction.count({ where: { relatedPaymentId: payment.id } });
    expect(txCount).toBe(1);
    expect(Number(await getWalletBalance())).toBe(Number(before) + 120);

    // Reconciling again is a safe no-op.
    const second = await reconcilePayment(payment.id, userId);
    expect(second.changed).toBe(false);
    expect(await prisma.walletTransaction.count({ where: { relatedPaymentId: payment.id } })).toBe(1);
  });
});
