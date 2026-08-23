import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { listLobbyGames } from "@/lib/game/queries";

export const runtime = "nodejs";

function serialize(g: Awaited<ReturnType<typeof listLobbyGames>>["live"][number]) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    status: g.status,
    startTime: g.startTime,
    registrationOpenAt: g.registrationOpenAt,
    registrationCloseAt: g.registrationCloseAt,
    ticketPrice: g.ticketPrice.toString(),
    maxPlayers: g.maxPlayers,
    playerCount: g._count.players,
    ticketsSold: g.ticketsSold,
    jackpotAmount: g.jackpotAmount.toString(),
    prizePool: g.prizePool,
    prizePercent: g.prizePercent,
    winningPatternName: g.winningPattern.name,
  };
}

export const GET = withApiHandler(async () => {
  const { live, upcoming } = await listLobbyGames();
  return jsonOk({
    games: [...live, ...upcoming].map(serialize),
  });
});
