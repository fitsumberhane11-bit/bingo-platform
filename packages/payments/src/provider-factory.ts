import type { PaymentProvider, PaymentProviderName } from "./types";
import { getMockPaymentProvider } from "./mock/mock-provider";
import { TelebirrProvider } from "./telebirr/telebirr-provider";
import { CBEProvider } from "./cbe/cbe-provider";
import { ChapaProvider } from "./chapa/chapa-provider";
import { ArifPayProvider } from "./arifpay/arifpay-provider";
import { MpesaProvider } from "./mpesa/mpesa-provider";

// See mock-provider.ts's comment on why this is globalThis-backed rather
// than plain module-scoped variables.
const globalForProviders = globalThis as unknown as {
  __telebirrProvider?: TelebirrProvider;
  __cbeProvider?: CBEProvider;
  __chapaProvider?: ChapaProvider;
  __arifPayProvider?: ArifPayProvider;
  __mpesaProvider?: MpesaProvider;
};

/**
 * The only place in the application that maps a provider name to a
 * concrete `PaymentProvider` implementation. Everything else (PaymentService,
 * API routes, UI) works against the `PaymentProvider` interface only.
 */
export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case "MOCK":
      return getMockPaymentProvider();
    case "TELEBIRR":
      return (globalForProviders.__telebirrProvider ??= new TelebirrProvider());
    case "CBE":
      return (globalForProviders.__cbeProvider ??= new CBEProvider());
    case "CHAPA":
      return (globalForProviders.__chapaProvider ??= new ChapaProvider());
    case "ARIFPAY":
      return (globalForProviders.__arifPayProvider ??= new ArifPayProvider());
    case "MPESA":
      return (globalForProviders.__mpesaProvider ??= new MpesaProvider());
  }
}
