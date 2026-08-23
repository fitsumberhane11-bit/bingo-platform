import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { Alert } from "@/components/ui/Alert";

export const metadata = { title: "Games" };

export default async function AdminGamesPage() {
  const current = await getCurrentUser();
  const ctx = await loadAccessContext(current!.sub);

  if (!hasPermission(ctx, PERMISSIONS.GAME_VIEW)) {
    return <Alert variant="error">You don&apos;t have permission to view games.</Alert>;
  }
  const canCreate = hasPermission(ctx, PERMISSIONS.GAME_CREATE);

  const games = await prisma.game.findMany({
    include: { winningPattern: { select: { name: true } }, _count: { select: { players: true, tickets: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Games</h1>
          <p className="text-sm text-slate-500">Create and manage Bingo games.</p>
        </div>
        {canCreate && (
          <Link href="/admin/games/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New game
          </Link>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Pattern</th>
              <th className="py-2 pr-3">Players</th>
              <th className="py-2 pr-3">Tickets</th>
              <th className="py-2 pr-3">Start time</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 pr-3 font-medium text-ink-900">{g.name}</td>
                <td className="py-2 pr-3">
                  <StatusBadge status={g.status} />
                </td>
                <td className="py-2 pr-3 text-slate-500">{g.winningPattern.name}</td>
                <td className="py-2 pr-3">
                  {g._count.players}/{g.maxPlayers}
                </td>
                <td className="py-2 pr-3">{g._count.tickets}</td>
                <td className="py-2 pr-3 text-xs text-slate-400">{new Date(g.startTime).toLocaleString()}</td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/games/${g.id}/finance`} className="text-xs font-semibold text-slate-500 hover:underline">
                      Finance
                    </Link>
                    <Link href={`/admin/games/${g.id}/control`} className="text-xs font-semibold text-brand-700 hover:underline">
                      Control panel
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {games.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No games yet.</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LIVE: "bg-red-50 text-red-600",
    OPEN: "bg-brand-50 text-brand-700",
    DRAFT: "bg-slate-100 text-slate-500",
    COMPLETED: "bg-slate-100 text-slate-500",
    CANCELLED: "bg-slate-100 text-slate-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-amber-50 text-amber-700"}`}>{status}</span>;
}
