import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { createDeposit } from "@/lib/payment-service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ amount: z.coerce.number().positive() });

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  await enforceRateLimit(`deposit:${current.sub}`, 20, 60 * 60);
  await enforceRateLimit(`deposit:ip:${getClientIp(req)}`, 40, 60 * 60);

  const { amount } = schema.parse(await req.json());
  // Throws ProviderNotConfiguredError (→ 503) until real Telebirr credentials
  // and TELEBIRR_MODE are set — see packages/payments/src/telebirr/telebirr-provider.ts.
  const payment = await createDeposit({ userId: current.sub, provider: "TELEBIRR", amount });

  return jsonOk({ payment });
});
