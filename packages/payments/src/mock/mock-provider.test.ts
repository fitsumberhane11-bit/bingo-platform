import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { MockPaymentProvider } from "./mock-provider";

describe("MockPaymentProvider", () => {
  it("creates an order in PENDING state", async () => {
    const provider = new MockPaymentProvider("test-secret");
    const order = await provider.createOrder({
      paymentId: "pay_1",
      userId: "user_1",
      amount: new Decimal(500),
      currency: "ETB",
      notifyUrl: "http://localhost/callback",
    });
    const verification = await provider.verifyTransaction(order.providerOrderId);
    expect(verification.status).toBe("PENDING");
  });

  it("simulateOutcome transitions the order and produces a validly-signed callback", async () => {
    const provider = new MockPaymentProvider("test-secret");
    const order = await provider.createOrder({
      paymentId: "pay_2",
      userId: "user_2",
      amount: new Decimal(100),
      currency: "ETB",
      notifyUrl: "http://localhost/callback",
    });

    const callback = provider.simulateOutcome(order.providerOrderId, "SUCCESS");
    expect(provider.isCallbackSignatureValid(callback)).toBe(true);

    const parsed = provider.parseCallback(callback);
    expect(parsed.status).toBe("SUCCESS");
    expect(parsed.providerOrderId).toBe(order.providerOrderId);
    expect(parsed.amount?.toString()).toBe("100");

    const verification = await provider.verifyTransaction(order.providerOrderId);
    expect(verification.status).toBe("SUCCESS");
    expect(verification.providerTransactionId).toBeDefined();
  });

  it("rejects a callback with a missing or wrong signature", async () => {
    const provider = new MockPaymentProvider("test-secret");
    const order = await provider.createOrder({
      paymentId: "pay_3",
      userId: "user_3",
      amount: new Decimal(50),
      currency: "ETB",
      notifyUrl: "http://localhost/callback",
    });
    const callback = provider.simulateOutcome(order.providerOrderId, "SUCCESS");

    expect(provider.isCallbackSignatureValid({ rawBody: callback.rawBody, headers: {} })).toBe(false);
    expect(
      provider.isCallbackSignatureValid({ rawBody: callback.rawBody, headers: { "x-mock-signature": "deadbeef" } }),
    ).toBe(false);
  });

  it("detects a tampered payload even if a signature header is present", async () => {
    const provider = new MockPaymentProvider("test-secret");
    const order = await provider.createOrder({
      paymentId: "pay_4",
      userId: "user_4",
      amount: new Decimal(50),
      currency: "ETB",
      notifyUrl: "http://localhost/callback",
    });
    const callback = provider.simulateOutcome(order.providerOrderId, "SUCCESS");

    // Attacker changes the amount in the body but keeps the original signature.
    const tamperedBody = callback.rawBody.replace('"amount":"50"', '"amount":"999999"');
    expect(provider.isCallbackSignatureValid({ rawBody: tamperedBody, headers: callback.headers })).toBe(false);
  });

  it("a signature from a different secret is rejected", async () => {
    const providerA = new MockPaymentProvider("secret-a");
    const providerB = new MockPaymentProvider("secret-b");
    const order = await providerA.createOrder({
      paymentId: "pay_5",
      userId: "user_5",
      amount: new Decimal(50),
      currency: "ETB",
      notifyUrl: "http://localhost/callback",
    });
    const callback = providerA.simulateOutcome(order.providerOrderId, "SUCCESS");
    expect(providerB.isCallbackSignatureValid(callback)).toBe(false);
  });
});
