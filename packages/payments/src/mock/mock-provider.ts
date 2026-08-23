import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import Decimal from "decimal.js";
import type {
  CallbackRequest,
  CreateOrderInput,
  CreateOrderResult,
  NormalizedPaymentStatus,
  ParsedCallback,
  PaymentProvider,
  VerificationResult,
} from "../types";

export type MockOutcome = "SUCCESS" | "PENDING" | "FAILED" | "CANCELLED" | "EXPIRED";

interface MockOrderState {
  paymentId: string;
  userId: string;
  amount: Decimal;
  status: NormalizedPaymentStatus;
  providerTransactionId?: string;
}

interface MockCallbackPayload {
  providerOrderId: string;
  providerTransactionId?: string;
  providerEventId: string;
  status: MockOutcome;
  amount: string;
  userId: string;
}

/**
 * Development/test-only provider. Simulates a real provider's shape
 * (create order → hosted-checkout-style redirect → async webhook callback)
 * without moving real money, so the entire payment pipeline — including
 * signature verification and idempotency — can be exercised end to end.
 *
 * State is held in-process (a Map), which is fine for a single dev server
 * and for tests, but is NOT a production pattern — this provider is
 * hard-disabled outside development by the caller (see
 * apps/web/lib/payment-service.ts and ENABLE_MOCK_PAYMENTS).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "MOCK" as const;
  readonly isConfigured = true;

  private orders = new Map<string, MockOrderState>();
  private secret: string;
  private forcedVerificationFailures = new Set<string>();

  constructor(secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || "mock-dev-secret-change-me") {
    this.secret = secret;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const providerOrderId = `mock_ord_${randomUUID()}`;
    this.orders.set(providerOrderId, {
      paymentId: input.paymentId,
      userId: input.userId,
      amount: input.amount,
      status: "PENDING",
    });
    return {
      providerOrderId,
      redirectUrl: `/wallet/deposit/mock-checkout?providerOrderId=${providerOrderId}`,
      raw: { simulated: true },
    };
  }

  async verifyTransaction(providerOrderId: string): Promise<VerificationResult> {
    if (this.forcedVerificationFailures.has(providerOrderId)) {
      // One-shot: models a transient network/API blip, not a permanently
      // broken provider — the next call succeeds normally, so tests can
      // exercise "reconciliation retries after the provider recovers".
      this.forcedVerificationFailures.delete(providerOrderId);
      throw new Error("Simulated provider verification failure (network/API error).");
    }
    const order = this.orders.get(providerOrderId);
    if (!order) return { status: "FAILED", raw: { reason: "unknown_order" } };
    return { status: order.status, providerTransactionId: order.providerTransactionId, amount: order.amount };
  }

  isCallbackSignatureValid(req: CallbackRequest): boolean {
    const provided = req.headers["x-mock-signature"];
    if (!provided) return false;
    const expected = this.sign(req.rawBody);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseCallback(req: CallbackRequest): ParsedCallback {
    const payload = JSON.parse(req.rawBody) as MockCallbackPayload;
    return {
      providerOrderId: payload.providerOrderId,
      providerTransactionId: payload.providerTransactionId,
      providerEventId: payload.providerEventId,
      status: payload.status,
      amount: new Decimal(payload.amount),
      raw: payload,
    };
  }

  // ---- Test/dev-only helpers (not part of the PaymentProvider interface) ----

  /** Moves a simulated order to a new outcome and returns a validly-signed callback ready to POST. */
  simulateOutcome(providerOrderId: string, outcome: MockOutcome): { rawBody: string; headers: Record<string, string> } {
    const order = this.orders.get(providerOrderId);
    if (!order) throw new Error(`Unknown mock providerOrderId: ${providerOrderId}`);

    const providerTransactionId = outcome === "SUCCESS" ? `mock_txn_${randomUUID()}` : order.providerTransactionId;
    order.status = outcome;
    order.providerTransactionId = providerTransactionId;

    return this.buildSignedCallback({
      providerOrderId,
      providerTransactionId,
      providerEventId: randomUUID(),
      status: outcome,
      amount: order.amount.toString(),
      userId: order.userId,
    });
  }

  /** Test hook: makes the next verifyTransaction() call for this order throw, simulating a provider outage. */
  forceVerificationFailure(providerOrderId: string): void {
    this.forcedVerificationFailures.add(providerOrderId);
  }

  /** Builds a validly-signed callback body/headers pair — used by tests to craft exact scenarios. */
  buildSignedCallback(payload: MockCallbackPayload): { rawBody: string; headers: Record<string, string> } {
    const rawBody = JSON.stringify(payload);
    return { rawBody, headers: { "x-mock-signature": this.sign(rawBody), "content-type": "application/json" } };
  }

  private sign(rawBody: string): string {
    return createHmac("sha256", this.secret).update(rawBody).digest("hex");
  }
}

// Singleton stored on `globalThis` — NOT a plain module-scoped variable —
// for the same reason apps/web/../db/src/index.ts does this for PrismaClient:
// Next.js's dev-mode bundler compiles each API route handler into its own
// webpack module graph, so a `let sharedInstance` at module scope ends up as
// a *different* instance per route (create vs. simulate vs. callback) even
// though they're served by the same Node process. `globalThis` is the one
// thing that's actually shared across all of those separately-bundled
// copies of this module.
const globalForMockProvider = globalThis as unknown as { __mockPaymentProvider?: MockPaymentProvider };

export function getMockPaymentProvider(): MockPaymentProvider {
  if (!globalForMockProvider.__mockPaymentProvider) {
    globalForMockProvider.__mockPaymentProvider = new MockPaymentProvider();
  }
  return globalForMockProvider.__mockPaymentProvider;
}
