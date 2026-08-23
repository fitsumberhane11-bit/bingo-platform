import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { calculatePrizePool } from "@bingo/game-core";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { NotFoundError } from "@/lib/errors";

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
  const prizePool = calculatePrizePool(
    game.prizeRule.config as { type: typeof game.prizeRule.type; winnerPercent?: number; fixedAmount?: number },
    ticketSalesTotal,
    game.jackpotAmount,
  );

  return jsonOk({
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      callMode: game.callMode,
      callIntervalSeconds: game.callIntervalSeconds,
      calledCount: game.calledCount,
      remainingCount: 75 - game.calledCount,
      playerCount: game._count.players,
      ticketCount: game._count.tickets,
      prizePool: prizePool.toString(),
      ticketSalesTotal: ticketSalesTotal.toString(),
      winningPattern: { id: game.winningPattern.id, name: game.winningPattern.name },
      seedCommitmentHash: game.seedCommitmentHash,
      seedRevealed: !!game.seedRevealedAt,
      startedAt: game.startedAt,
      pausedAt: game.pausedAt,
      completedAt: game.completedAt,
      calledNumbers: game.calledNumbers.map((n) => ({ ballNumber: n.ballNumber, letter: n.letter, sequenceNumber: n.sequenceNumber })),
    },
    events: game.events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt })),
  });
});
