import {
  ProviderNotConfiguredError,
  type CallbackRequest,
  type CreateOrderInput,
  type CreateOrderResult,
  type ParsedCallback,
  type PaymentProvider,
  type VerificationResult,
} from "../types";

export interface MpesaConfig {
  apiUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  shortCode?: string;
  notifyUrl?: string;
}

/**
 * STATUS: NOT CONNECTED — no M-Pesa (Safaricom Ethiopia) merchant
 * credentials have been supplied to this project. Same reasoning as
 * `chapa-provider.ts` / `arifpay-provider.ts`.
 *
 * To activate this provider for real:
 *  1. Obtain M-Pesa merchant credentials (consumer key/secret, short code)
 *     for the Ethiopian M-Pesa deployment.
 *  2. Populate MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORT_CODE,
 *     MPESA_API_URL.
 *  3. Implement createOrder/verifyTransaction/isCallbackSignatureValid/
 *     parseCallback against the documented STK Push / callback API, tested
 *     against a sandbox before enabling production.
 */
export class MpesaProvider implements PaymentProvider {
  readonly name = "MPESA" as const;

  private config: MpesaConfig;

  constructor(config: MpesaConfig = readMpesaConfigFromEnv()) {
    this.config = config;
  }

  get isConfigured(): boolean {
    return false;
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
    return new ProviderNotConfiguredError("MPESA", "no M-Pesa merchant credentials have been supplied yet — this adapter is a structural placeholder");
  }
}

function readMpesaConfigFromEnv(): MpesaConfig {
  return {
    apiUrl: process.env.MPESA_API_URL,
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortCode: process.env.MPESA_SHORT_CODE,
    notifyUrl: process.env.MPESA_NOTIFY_URL,
  };
}
