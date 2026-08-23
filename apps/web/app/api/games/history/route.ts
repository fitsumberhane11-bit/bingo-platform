import type { NextRequest } from "next/server";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { getPlayerGameHistory } from "@/lib/game/queries";

export const runtime = "nodejs";

export const GET = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = 10;

  const statusParam = searchParams.get("status");
  const status = statusParam === "COMPLETED" || statusParam === "CANCELLED" ? statusParam : undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  const winningPatternId = searchParams.get("winningPatternId") || undefined;
  const wonOnly = searchParams.get("wonOnly") === "true";
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  const { games, total } = await getPlayerGameHistory(current.sub, page, pageSize, { status, search, winningPatternId, wonOnly, from, to });

  return jsonOk({
    games: games.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      completedAt: g.completedAt,
      winningPatternName: g.winningPattern.name,
      playerCount: g._count.players,
      winnerCount: g._count.winners,
      myPrizeAmount: g.winners[0]?.prizeAmount.toString() ?? null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});
