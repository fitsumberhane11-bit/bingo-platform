import { notFound } from "next/navigation";
import { getGameSnapshot } from "@/lib/game/snapshot";
import { getCurrentUser } from "@/lib/current-user";
import { GameRoom } from "./GameRoom";

export const metadata = { title: "Game Room" };

export default async function RoomPage({ params }: { params: { gameId: string } }) {
  const current = await getCurrentUser();
  const snapshot = await getGameSnapshot(params.gameId, current?.sub);
  if (!snapshot) notFound();

  return (
    <GameRoom
      gameId={params.gameId}
      // JSON round-trip so the initial prop is byte-identical in shape to
      // what the SSE `game:sync` event delivers (dates as ISO strings) —
      // one wire format for the snapshot, whether it arrives via the
      // initial page load or a live reconnect.
      initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
      isAuthenticated={!!current}
    />
  );
}
