import {
  ProviderNotConfiguredError,
  type CallbackRequest,
  type CreateOrderInput,
  type CreateOrderResult,
  type ParsedCallback,
  type PaymentProvider,
  type VerificationResult,
} from "../types";

export interface ChapaConfig {
  apiUrl?: string;
  secretKey?: string;
  publicKey?: string;
  notifyUrl?: string;
}

/**
 * STATUS: NOT CONNECTED — no Chapa merchant account/API keys have been
 * supplied to this project. Chapa's API is publicly documented, unlike CBE,
 * but this adapter deliberately does not implement against that
 * documentation from memory: doing so without a real sandbox account to
 * test against would produce code that looks plausible but is unverified,
 * which is worse than an honest placeholder. See `cbe-provider.ts` for the
 * same reasoning in more detail.
 *
 * To activate this provider for real:
 *  1. Obtain a Chapa merchant account and API keys (test + live).
 *  2. Populate CHAPA_SECRET_KEY, CHAPA_PUBLIC_KEY, CHAPA_API_URL.
 *  3. Implement createOrder/verifyTransaction/isCallbackSignatureValid/
 *     parseCallback against Chapa's documented API and webhook signature
 *     scheme, and test against Chapa's sandbox before enabling production.
 */
export class ChapaProvider implements PaymentProvider {
  readonly name = "CHAPA" as const;

  private config: ChapaConfig;

  constructor(config: ChapaConfig = readChapaConfigFromEnv()) {
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
    return new ProviderNotConfiguredError("CHAPA", "no Chapa merchant credentials have been supplied yet — this adapter is a structural placeholder");
  }
}

function readChapaConfigFromEnv(): ChapaConfig {
  return {
    apiUrl: process.env.CHAPA_API_URL,
    secretKey: process.env.CHAPA_SECRET_KEY,
    publicKey: process.env.CHAPA_PUBLIC_KEY,
    notifyUrl: process.env.CHAPA_NOTIFY_URL,
  };
}
