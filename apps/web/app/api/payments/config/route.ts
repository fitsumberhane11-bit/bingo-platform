import { getPaymentProvider } from "@bingo/payments";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { getDepositLimits, isMockProviderAvailable } from "@/lib/payment-service";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  await requireCurrentUser();
  const limits = await getDepositLimits();

  const providerMeta = [
    { id: "TELEBIRR" as const, label: "Telebirr" },
    { id: "CBE" as const, label: "Commercial Bank of Ethiopia" },
    { id: "CHAPA" as const, label: "Chapa" },
    { id: "ARIFPAY" as const, label: "ArifPay" },
    { id: "MPESA" as const, label: "M-Pesa" },
  ];

  const providers = [
    ...providerMeta.map(({ id, label }) => {
      const available = getPaymentProvider(id).isConfigured;
      return {
        id,
        label,
        available,
        description: available ? `Deposit securely using ${label}` : "Coming soon — after the demo phase",
      };
    }),
    ...(isMockProviderAvailable()
      ? [{ id: "MOCK" as const, label: "Add DEMO Balance", available: true, description: "Instant — no real money involved" }]
      : []),
  ];

  return jsonOk({ limits, providers, currency: "ETB" });
});
