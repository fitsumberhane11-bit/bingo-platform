import Decimal from "decimal.js";

export type PaymentProviderName = "TELEBIRR" | "CBE" | "CHAPA" | "ARIFPAY" | "MPESA" | "MOCK";

/** Every provider's wildly different status vocabulary gets normalized to this before it touches PaymentService. */
export type NormalizedPaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";

export interface CreateOrderInput {
  /** Our internal Payment.id — always sent to the provider as the merchant order reference. */
  paymentId: string;
  userId: string;
  amount: Decimal;
  currency: string;
  description?: string;
  /** Where the browser returns to after a hosted checkout page, if the provider uses one. */
  returnUrl?: string;
  notifyUrl: string;
}

export interface CreateOrderResult {
  providerOrderId: string;
  /** Present when the player must be redirected to a hosted payment page. */
  redirectUrl?: string;
  raw?: unknown;
}

export interface VerificationResult {
  status: NormalizedPaymentStatus;
  providerTransactionId?: string;
  amount?: Decimal;
  raw?: unknown;
}

export interface ParsedCallback {
  providerOrderId: string;
  providerTransactionId?: string;
  /** The provider's own notification/event id, when it sends one distinct from the transaction id. */
  providerEventId?: string;
  status: NormalizedPaymentStatus;
  /** Amount as reported by the callback, when present — compared against our record to catch tampering. */
  amount?: Decimal;
  raw: unknown;
}

export interface CallbackRequest {
  rawBody: string;
  headers: Record<string, string>;
}

/**
 * The interface every payment provider implements. `PaymentService` (in
 * apps/web/lib/payment-service.ts) is the ONLY caller of these methods —
 * nothing else in the application talks to a provider directly, so adding a
 * new provider or swapping mock-for-real never touches wallet/game code.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** False when required env vars/credentials are missing — callers must check this before createOrder. */
  readonly isConfigured: boolean;

  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;

  /** Independent server-to-server status check — never trust a callback body alone. */
  verifyTransaction(providerOrderId: string): Promise<VerificationResult>;

  isCallbackSignatureValid(req: CallbackRequest): boolean;

  parseCallback(req: CallbackRequest): ParsedCallback;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string, detail?: string) {
    super(
      `${provider} is not configured for real transactions${detail ? `: ${detail}` : ""}. ` +
        "Production credentials/API access have not been supplied yet — see docs/ARCHITECTURE.md and docs/STATUS.md.",
    );
    this.name = "ProviderNotConfiguredError";
  }
}

export { Decimal };
