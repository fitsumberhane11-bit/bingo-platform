import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { getGameWinners } from "@/lib/game/queries";

export const runtime = "nodejs";

// Privacy-conscious: exposes username (already public elsewhere, e.g.
// leaderboards) but never phone/email.
export const GET = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  const winners = await getGameWinners(params.gameId);
  return jsonOk({
    winners: winners.map((w) => ({
      id: w.id,
      username: w.user.username,
      ticketNumber: w.ticket.ticketNumber,
      ballNumberAtWin: w.ballNumberAtWin,
      prizeAmount: w.prizeAmount.toString(),
      splitCount: w.splitCount,
      confirmedAt: w.confirmedAt,
    })),
  });
});
