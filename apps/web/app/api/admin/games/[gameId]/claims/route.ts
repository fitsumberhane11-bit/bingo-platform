import { PERMISSIONS } from "@bingo/shared-types";
import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";

export const runtime = "nodejs";

// Operator claims dashboard (Section 18/19) — every claim ever submitted for
// this game, newest first, with enough evidence for a human to review a
// PENDING one without leaving this list.
export const GET = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  await requireApiPermission(PERMISSIONS.GAME_CLAIM_CONFIRM);

  const claims = await prisma.bingoClaim.findMany({
    where: { gameId: params.gameId },
    include: {
      ticket: { select: { ticketNumber: true, cardNumbers: true } },
      user: { select: { username: true } },
      pattern: { select: { name: true } },
      stage: { select: { label: true, order: true, prizeAmount: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });

  return jsonOk({
    claims: claims.map((c) => ({
      id: c.id,
      ticketId: c.ticketId,
      ticketNumber: c.ticket.ticketNumber,
      cardNumbers: c.ticket.cardNumbers,
      username: c.user.username,
      pattern: c.pattern.name,
      stageLabel: c.stage?.label ?? null,
      prizeAmount: c.stage?.prizeAmount?.toString() ?? null,
      validationStatus: c.validationStatus,
      invalidReason: c.invalidReason,
      confirmationStatus: c.confirmationStatus,
      submittedAt: c.submittedAt,
      confirmedAt: c.confirmedAt,
    })),
  });
});
