import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@bingo/db";
import { getMockPaymentProvider, type MockOutcome } from "@bingo/payments";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { processPaymentCallback } from "@/lib/payment-service";
import { isMockProviderAvailable } from "@/lib/payment-service";

export const runtime = "nodejs";

const schema = z.object({
  outcome: z.enum(["SUCCESS", "PENDING", "FAILED", "CANCELLED", "EXPIRED"]),
  /** Dev-only knob for testing the duplicate-callback pipeline from the UI. */
  repeat: z.coerce.number().int().min(1).max(25).default(1),
});

/**
 * DEV-ONLY convenience endpoint standing in for "the provider calls our
 * webhook". It constructs a real, validly-signed callback via
 * MockPaymentProvider and feeds it through the exact same
 * `processPaymentCallback` pipeline a genuine webhook delivery uses —
 * nothing about wallet crediting is special-cased for the UI path.
 */
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { paymentId: string } }) => {
  if (!isMockProviderAvailable()) {
    throw new ValidationError("Mock payments are disabled in this environment.");
  }

  const current = await requireCurrentUser();
  const { outcome, repeat } = schema.parse(await req.json());

  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.userId !== current.sub) throw new ForbiddenError("This payment does not belong to you.");
  if (payment.provider !== "MOCK") throw new ValidationError("This payment was not created with the mock provider.");
  if (!payment.providerOrderId) throw new ValidationError("Payment has no provider order yet.");

  const provider = getMockPaymentProvider();
  const results = [];
  for (let i = 0; i < repeat; i++) {
    const callback = provider.simulateOutcome(payment.providerOrderId, outcome as MockOutcome);
    results.push(await processPaymentCallback("MOCK", callback));
  }

  const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return jsonOk({ payment: updated, callbacksSent: repeat, results });
});
