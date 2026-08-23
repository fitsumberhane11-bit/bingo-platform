import {
  ProviderNotConfiguredError,
  type CallbackRequest,
  type CreateOrderInput,
  type CreateOrderResult,
  type ParsedCallback,
  type PaymentProvider,
  type VerificationResult,
} from "../types";

export interface CbeConfig {
  apiUrl?: string;
  merchantId?: string;
  apiKey?: string;
  secret?: string;
  notifyUrl?: string;
}

/**
 * STATUS: PENDING OFFICIAL MERCHANT/API SPECIFICATION.
 *
 * Commercial Bank of Ethiopia does not have a publicly documented merchant
 * payment API available to this project at the time of writing. Rather than
 * guess at endpoints, request/response shapes, or a signature scheme (which
 * would produce code that looks real but is fiction), this class implements
 * the full `PaymentProvider` contract with every method explicitly failing
 * closed via `ProviderNotConfiguredError`.
 *
 * This keeps the rest of the platform (PaymentService, wallet ledger,
 * deposit UI, reconciliation) completely decoupled from CBE specifics — see
 * `packages/payments/src/types.ts` — so that once a CBE merchant agreement
 * and API/gateway specification exist (whether a direct CBE API or an
 * approved aggregator), only this one file needs to be filled in.
 *
 * To activate this provider for real:
 *  1. Obtain the CBE (or CBE-approved aggregator) merchant agreement and
 *     official API/webhook specification.
 *  2. Populate CBE_API_URL, CBE_MERCHANT_ID, CBE_API_KEY, CBE_SECRET.
 *  3. Implement createOrder/verifyTransaction/isCallbackSignatureValid/
 *     parseCallback against the documented contract.
 *  4. Test against a CBE-provided sandbox/UAT environment before enabling
 *     production mode.
 */
export class CBEProvider implements PaymentProvider {
  readonly name = "CBE" as const;

  private config: CbeConfig;

  constructor(config: CbeConfig = readCbeConfigFromEnv()) {
    this.config = config;
  }

  get isConfigured(): boolean {
    // Always false until an official specification exists — there is no
    // "credentials present" path that makes this provider usable yet.
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
    return new ProviderNotConfiguredError(
      "CBE",
      "the official CBE merchant/API specification has not been obtained yet — this adapter is a structural placeholder (config, lifecycle, callback shape) pending that documentation",
    );
  }
}

function readCbeConfigFromEnv(): CbeConfig {
  return {
    apiUrl: process.env.CBE_API_URL,
    merchantId: process.env.CBE_MERCHANT_ID,
    apiKey: process.env.CBE_API_KEY,
    secret: process.env.CBE_SECRET,
    notifyUrl: process.env.CBE_NOTIFY_URL,
  };
}
