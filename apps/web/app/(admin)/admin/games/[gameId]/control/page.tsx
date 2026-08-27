import { redirect } from "next/navigation";
import { PERMISSIONS } from "@bingo/shared-types";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { ControlPanel } from "./ControlPanel";

export const metadata = { title: "Game Operator" };

export default async function GameControlPage({ params }: { params: { gameId: string } }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);
  const canManage = hasPermission(ctx, PERMISSIONS.GAME_START);

  return <ControlPanel gameId={params.gameId} canManage={canManage} />;
}
