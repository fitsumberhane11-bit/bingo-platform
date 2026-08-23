import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = withApiHandler(async (_req: Request, { params }: { params: { paymentId: string } }) => {
  const current = await requireCurrentUser();
  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    select: {
      id: true,
      userId: true,
      provider: true,
      amount: true,
      currency: true,
      status: true,
      failureReason: true,
      createdAt: true,
      updatedAt: true,
      verifiedAt: true,
    },
  });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.userId !== current.sub) throw new ForbiddenError("This payment does not belong to you.");

  return jsonOk({ payment });
});
