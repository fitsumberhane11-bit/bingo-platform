import {
  ProviderNotConfiguredError,
  type CallbackRequest,
  type CreateOrderInput,
  type CreateOrderResult,
  type ParsedCallback,
  type PaymentProvider,
  type VerificationResult,
} from "../types";

export interface ArifPayConfig {
  apiUrl?: string;
  apiKey?: string;
  notifyUrl?: string;
}

/**
 * STATUS: NOT CONNECTED — no ArifPay merchant account/API keys have been
 * supplied to this project. Same reasoning as `chapa-provider.ts`: not
 * implemented against documentation from memory without a real account to
 * verify it against.
 *
 * To activate this provider for real:
 *  1. Obtain an ArifPay merchant account and API key.
 *  2. Populate ARIFPAY_API_KEY, ARIFPAY_API_URL.
 *  3. Implement createOrder/verifyTransaction/isCallbackSignatureValid/
 *     parseCallback against ArifPay's documented API and webhook scheme,
 *     tested against their sandbox before enabling production.
 */
export class ArifPayProvider implements PaymentProvider {
  readonly name = "ARIFPAY" as const;

  private config: ArifPayConfig;

  constructor(config: ArifPayConfig = readArifPayConfigFromEnv()) {
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
    return new ProviderNotConfiguredError("ARIFPAY", "no ArifPay merchant credentials have been supplied yet — this adapter is a structural placeholder");
  }
}

function readArifPayConfigFromEnv(): ArifPayConfig {
  return {
    apiUrl: process.env.ARIFPAY_API_URL,
    apiKey: process.env.ARIFPAY_API_KEY,
    notifyUrl: process.env.ARIFPAY_NOTIFY_URL,
  };
}
