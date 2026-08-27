import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { NotFoundError } from "@/lib/errors";
import { resolveGamePrizePool } from "@/lib/game/prize-authority";

export const runtime = "nodejs";

export const GET = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  await requireApiPermission(PERMISSIONS.GAME_VIEW);

  const game = await prisma.game.findUnique({
    where: { id: params.gameId },
    include: {
      winningPattern: true,
      prizeRule: true,
      calledNumbers: { orderBy: { sequenceNumber: "asc" } },
      _count: { select: { players: true, tickets: true } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!game) throw new NotFoundError("Game not found.");

  const salesAgg = await prisma.bingoTicket.aggregate({ where: { gameId: game.id }, _sum: { purchasePrice: true } });
  const ticketSalesTotal = salesAgg._sum.purchasePrice ?? game.ticketPrice.mul(0);
  const prizePool = await resolveGamePrizePool(game, game.prizeRule);

  const winningStages = await prisma.winningStage.findMany({
    where: { gameId: game.id },
    include: { pattern: { select: { name: true } } },
    orderBy: { order: "asc" },
  });
  const pendingClaimCount = await prisma.bingoClaim.count({ where: { gameId: game.id, validationStatus: "VALID", confirmationStatus: "PENDING" } });
  const falseClaimCount = await prisma.bingoClaim.count({ where: { gameId: game.id, validationStatus: "INVALID" } });
  const disqualifiedCardCount = await prisma.bingoTicket.count({ where: { gameId: game.id, status: "DISQUALIFIED" } });
  const disqualifiedTickets = await prisma.bingoTicket.findMany({
    where: { gameId: game.id, status: "DISQUALIFIED" },
    include: { user: { select: { username: true } } },
    orderBy: { disqualifiedAt: "desc" },
  });

  return jsonOk({
    game: {
      id: game.id,
      name: game.name,
      gameCode: game.gameCode,
      status: game.status,
      ticketPrice: game.ticketPrice.toString(),
      callMode: game.callMode,
      callIntervalSeconds: game.callIntervalSeconds,
      calledCount: game.calledCount,
      remainingCount: 75 - game.calledCount,
      playerCount: game._count.players,
      ticketCount: game._count.tickets,
      prizePool: prizePool.toString(),
      operatorPrizeAmount: game.operatorPrizeAmount?.toString() ?? null,
      ticketSalesTotal: ticketSalesTotal.toString(),
      winningPattern: { id: game.winningPattern.id, name: game.winningPattern.name },
      seedCommitmentHash: game.seedCommitmentHash,
      seedRevealed: !!game.seedRevealedAt,
      startedAt: game.startedAt,
      pausedAt: game.pausedAt,
      completedAt: game.completedAt,
      calledNumbers: game.calledNumbers.map((n) => ({ ballNumber: n.ballNumber, letter: n.letter, sequenceNumber: n.sequenceNumber })),
    },
    winningStages: winningStages.map((s) => ({
      id: s.id,
      order: s.order,
      label: s.label ?? s.pattern.name,
      patternName: s.pattern.name,
      prizeAmount: s.prizeAmount.toString(),
      winnerLimit: s.winnerLimit,
      winnerCount: s.winnerCount,
      status: s.status,
    })),
    pendingClaimCount,
    falseClaimCount,
    disqualifiedCardCount,
    disqualifiedTickets: disqualifiedTickets.map((t) => ({
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      username: t.user.username,
      reason: t.disqualifiedReason,
      disqualifiedAt: t.disqualifiedAt,
    })),
    events: game.events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt })),
  });
});
