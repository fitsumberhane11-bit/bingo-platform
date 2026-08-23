import {
  ProviderNotConfiguredError,
  type CallbackRequest,
  type CreateOrderInput,
  type CreateOrderResult,
  type ParsedCallback,
  type PaymentProvider,
  type VerificationResult,
} from "../types";

export interface TelebirrConfig {
  appId?: string;
  appKey?: string;
  shortCode?: string;
  privateKey?: string;
  publicKey?: string;
  notifyUrl?: string;
  apiBaseUrl?: string;
}

/**
 * STATUS: CODE IMPLEMENTED (adapter structure only) — PROVIDER INTEGRATION
 * NOT VERIFIED.
 *
 * This adapter exists so the rest of the application (PaymentService, the
 * wallet ledger, the deposit UI) can be built and tested end to end against
 * the `PaymentProvider` interface without waiting on Telebirr credentials.
 *
 * It deliberately does NOT implement request signing, specific endpoint
 * paths, or callback field names, because doing so without the official
 * Telebirr merchant/developer documentation in hand would mean inventing an
 * API — which produces code that looks complete but silently fails (or
 * worse, silently succeeds against nothing) the moment real money is
 * involved. Every method throws `ProviderNotConfiguredError` explaining
 * exactly what's missing.
 *
 * To finish this adapter for real:
 *  1. Obtain Telebirr merchant onboarding + the current API specification
 *     (create-order endpoint, request/response fields, signature algorithm
 *     — Telebirr's documented scheme is typically RSA request signing with
 *     the merchant's private key and response/callback verification with
 *     Telebirr's public key, but the exact field names and encoding must
 *     come from the official docs, not be guessed here).
 *  2. Fill in `createOrder` to call the documented create-order endpoint,
 *     signed per spec, returning the H5/redirect URL Telebirr provides.
 *  3. Fill in `verifyTransaction` to call Telebirr's server-to-server
 *     query-order endpoint.
 *  4. Fill in `isCallbackSignatureValid` to verify Telebirr's callback
 *     signature using `TELEBIRR_PUBLIC_KEY`.
 *  5. Fill in `parseCallback` to map Telebirr's actual callback fields to
 *     `ParsedCallback`.
 *  6. Test against Telebirr's sandbox before ever setting
 *     `TELEBIRR_MODE=production`.
 */
export class TelebirrProvider implements PaymentProvider {
  readonly name = "TELEBIRR" as const;

  private config: TelebirrConfig;
  private mode: "unset" | "sandbox" | "production";

  constructor(config: TelebirrConfig = readTelebirrConfigFromEnv()) {
    this.config = config;
    const mode = process.env.TELEBIRR_MODE;
    this.mode = mode === "sandbox" || mode === "production" ? mode : "unset";
  }

  get isConfigured(): boolean {
    const hasCredentials = !!(
      this.config.appId &&
      this.config.appKey &&
      this.config.shortCode &&
      this.config.privateKey &&
      this.config.publicKey
    );
    return hasCredentials && this.mode !== "unset";
  }

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw this.notConfiguredError();
  }

  async verifyTransaction(_providerOrderId: string): Promise<VerificationResult> {
    throw this.notConfiguredError();
  }

  isCallbackSignatureValid(_req: CallbackRequest): boolean {
    throw this.notConfiguredError();
  }

  parseCallback(_req: CallbackRequest): ParsedCallback {
    throw this.notConfiguredError();
  }

  private notConfiguredError() {
    const missing: string[] = [];
    if (!this.config.appId) missing.push("TELEBIRR_APP_ID");
    if (!this.config.appKey) missing.push("TELEBIRR_APP_KEY");
    if (!this.config.shortCode) missing.push("TELEBIRR_SHORT_CODE");
    if (!this.config.privateKey) missing.push("TELEBIRR_PRIVATE_KEY");
    if (!this.config.publicKey) missing.push("TELEBIRR_PUBLIC_KEY");
    if (this.mode === "unset") missing.push("TELEBIRR_MODE=sandbox|production");

    return new ProviderNotConfiguredError(
      "Telebirr",
      missing.length > 0
        ? `missing ${missing.join(", ")}`
        : "request signing and endpoint wiring are not implemented pending official API documentation (see class-level comment in telebirr-provider.ts)",
    );
  }
}

function readTelebirrConfigFromEnv(): TelebirrConfig {
  return {
    appId: process.env.TELEBIRR_APP_ID,
    appKey: process.env.TELEBIRR_APP_KEY,
    shortCode: process.env.TELEBIRR_SHORT_CODE,
    privateKey: process.env.TELEBIRR_PRIVATE_KEY,
    publicKey: process.env.TELEBIRR_PUBLIC_KEY,
    notifyUrl: process.env.TELEBIRR_NOTIFY_URL,
    apiBaseUrl: process.env.TELEBIRR_API_BASE_URL,
  };
}
