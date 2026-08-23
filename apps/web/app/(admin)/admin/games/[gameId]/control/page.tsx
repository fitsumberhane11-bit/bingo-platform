import { ControlPanel } from "./ControlPanel";

export const metadata = { title: "Game Operator" };

export default function GameControlPage({ params }: { params: { gameId: string } }) {
  return <ControlPanel gameId={params.gameId} />;
}
