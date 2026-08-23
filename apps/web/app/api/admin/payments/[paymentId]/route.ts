import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Full financial audit trail for a single payment — everything Finance
 * needs to answer "who initiated it, what happened, and why" without
 * touching the database directly.
 */
export const GET = withApiHandler(async (_req: Request, { params }: { params: { paymentId: string } }) => {
  await requireApiPermission(PERMISSIONS.PAYMENT_VIEW);

  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    include: {
      user: { select: { id: true, username: true, fullName: true, email: true } },
      walletTransactions: true,
      callbackLogs: { orderBy: { receivedAt: "asc" } },
    },
  });
  if (!payment) throw new NotFoundError("Payment not found.");

  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Payment", entityId: payment.id },
    include: { actor: { select: { username: true } } },
    orderBy: { createdAt: "asc" },
  });

  return jsonOk({ payment, auditLogs });
});
