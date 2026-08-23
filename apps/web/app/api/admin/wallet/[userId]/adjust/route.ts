import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { applyWalletTransaction } from "@/lib/wallet-service";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { getClientIp, getUserAgent } from "@/lib/request";

export const runtime = "nodejs";

const bodySchema = z.object({
  direction: z.enum(["CREDIT", "DEBIT"]),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  reason: z.string().trim().min(5, "A detailed reason is required for manual wallet adjustments."),
});

/**
 * The ONLY way an admin can change a user's balance. There is deliberately
 * no "set balance to X" endpoint — every adjustment is a signed CREDIT or
 * DEBIT that goes through the same ledger path as deposits and ticket
 * purchases, is fully audited, and requires a written reason.
 */
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { userId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.WALLET_ADJUST);
  const { direction, amount, reason } = bodySchema.parse(await req.json());

  const walletTx = await applyWalletTransaction({
    userId: params.userId,
    type: "ADJUSTMENT",
    direction,
    amount,
    referenceId: `adjustment:${params.userId}:${randomUUID()}`,
    metadata: { reason, adjustedByUserId: ctx.userId },
  });

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "WALLET_MANUAL_ADJUSTMENT",
    entityType: "Wallet",
    entityId: params.userId,
    oldValue: { balanceBefore: walletTx.balanceBefore.toString() },
    newValue: { balanceAfter: walletTx.balanceAfter.toString(), direction, amount, reason },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  await notifyUser({
    userId: params.userId,
    type: "WALLET_ADJUSTMENT",
    title: direction === "CREDIT" ? "Balance credited" : "Balance debited",
    body: `Your wallet was ${direction === "CREDIT" ? "credited" : "debited"} ETB ${amount} by an administrator. Reason: ${reason}`,
  });

  return jsonOk({ transaction: walletTx });
});
