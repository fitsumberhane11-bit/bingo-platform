import type { NextRequest } from "next/server";
import type { PaymentProviderType } from "@bingo/db";
import { jsonOk } from "./api-handler";
import { processPaymentCallback } from "./payment-service";

/**
 * Shared handler for every provider's `/api/payments/:provider/callback`
 * route. Always returns 200 with a small `{ received: true }` body — the
 * outcome (applied / duplicate / rejected) is recorded server-side in
 * `PaymentCallbackLog`, not exposed to the caller, since callback endpoints
 * are unauthenticated by nature and shouldn't leak processing detail to
 * whoever is hitting them.
 */
export function createCallbackHandler(providerName: PaymentProviderType) {
  return async function handleCallback(req: NextRequest): Promise<Response> {
    const rawBody = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    await processPaymentCallback(providerName, { rawBody, headers });

    return jsonOk({ received: true });
  };
}
