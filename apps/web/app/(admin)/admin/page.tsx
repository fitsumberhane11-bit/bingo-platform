import Link from "next/link";
import { Users, UserCheck, Radio, Ticket, TrendingUp, Award, Landmark, Plus, Trophy } from "lucide-react";
import { prisma, type GameStatus } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { getAdminDashboardStats } from "@/lib/reports/admin-dashboard";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { QuickAnnouncementForm } from "@/components/admin/QuickAnnouncementForm";
import { formatETB } from "@/lib/format";

export const metadata = { title: "Admin Dashboard" };

const IN_PROGRESS_STATUSES: GameStatus[] = ["STARTING", "LIVE", "PAUSED"];
const WAITING_STATUSES: GameStatus[] = ["DRAFT", "SCHEDULED", "OPEN", "FULL"];
const NEXT_ACTION_LABEL: Partial<Record<GameStatus, string>> = {
  DRAFT: "Schedule",
  SCHEDULED: "Open registration",
};

export default async function AdminHomePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);
  const canViewReports = hasPermission(ctx, PERMISSIONS.REPORTS_VIEW);
  const canRunGames = hasPermission(ctx, PERMISSIONS.GAME_CREATE);
  const canViewPayments = hasPermission(ctx, PERMISSIONS.PAYMENT_VIEW);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{canRunGames && !canViewReports ? "Operator Console" : "Admin Dashboard"}</h1>
        <p className="text-sm text-slate-500">
          {canViewReports
            ? "Live platform metrics, computed from the database on every page load."
            : canRunGames
              ? "Create games, run the floor, announce to players, and see who won."
              : "Financial metrics are restricted to Finance and Admin roles."}
        </p>
      </div>

      {canViewReports && <DashboardMetrics />}
      {canRunGames && <OperatorConsole />}

      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Link href="/admin/games" className="card flex items-center gap-3 hover:bg-slate-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Radio className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-semibold text-ink-900">Games</span>
            <span className="block text-sm text-slate-500">Create games and run the live operator console.</span>
          </span>
        </Link>
        {canViewPayments && (
          <Link href="/admin/finance" className="card flex items-center gap-3 hover:bg-slate-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Landmark className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink-900">Finance</span>
              <span className="block text-sm text-slate-500">Full financial reconciliation and consistency checks.</span>
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

async function OperatorConsole() {
  const [inProgress, waiting, recentWinners] = await Promise.all([
    prisma.game.findMany({
      where: { status: { in: IN_PROGRESS_STATUSES } },
      include: { _count: { select: { players: true, tickets: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.game.findMany({
      where: { status: { in: WAITING_STATUSES } },
      include: { _count: { select: { players: true, tickets: true } } },
      orderBy: { startTime: "asc" },
      take: 10,
    }),
    prisma.winner.findMany({
      include: { ticket: { select: { ticketNumber: true } }, user: { select: { username: true } }, game: { select: { name: true } } },
      orderBy: { confirmedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/games/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Create game
        </Link>
        <QuickAnnouncementForm />
      </div>

      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Running now</p>
        {inProgress.length === 0 ? (
          <p className="text-sm text-slate-300">No games are LIVE right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {inProgress.map((g) => (
              <li key={g.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
                <span className="flex items-center gap-2">
                  <StatusPill status={g.status} />
                  <span className="font-medium text-ink-900">{g.name}</span>
                  <span className="text-xs text-slate-400">
                    {g._count.players} players · {g._count.tickets} cards
                  </span>
                </span>
                <Link href={`/admin/games/${g.id}/control`} className="text-xs font-semibold text-brand-700 hover:underline">
                  Watch / manage
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting to start</p>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-300">Nothing scheduled, open, or ready to start.</p>
        ) : (
          <ul className="space-y-1.5">
            {waiting.map((g) => (
              <li key={g.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
                <span className="flex items-center gap-2">
                  <StatusPill status={g.status} />
                  <span className="font-medium text-ink-900">{g.name}</span>
                  <span className="text-xs text-slate-400">
                    {g._count.players} players · {g._count.tickets} cards
                  </span>
                </span>
                <Link href={`/admin/games/${g.id}/control`} className="text-xs font-semibold text-brand-700 hover:underline">
                  {NEXT_ACTION_LABEL[g.status] ?? "Start game"}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Players can&apos;t buy tickets until registration is Opened. A game goes Draft → Scheduled → registration Opened (tickets go on sale) →
          Started. Each step is a separate click on the control panel.
        </p>
      </div>

      <div className="card">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Trophy className="h-3.5 w-3.5 text-gold-600" /> Recent winners
        </p>
        {recentWinners.length === 0 ? (
          <p className="text-sm text-slate-300">No confirmed winners yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentWinners.map((w) => (
              <li key={w.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
                <span>
                  <span className="font-medium text-ink-900">{w.user.username}</span>{" "}
                  <span className="text-slate-500">
                    won on <span className="font-mono font-semibold text-ink-900">Card #{w.ticket.ticketNumber}</span> — {w.game.name}
                  </span>
                </span>
                <span className="font-mono text-xs font-semibold text-gold-600">{formatETB(w.prizeAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LIVE: "bg-red-50 text-red-600",
    STARTING: "bg-amber-50 text-amber-600",
    PAUSED: "bg-slate-100 text-slate-600",
    OPEN: "bg-emerald-50 text-emerald-700",
    FULL: "bg-emerald-50 text-emerald-700",
    SCHEDULED: "bg-blue-50 text-blue-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? "bg-slate-100 text-slate-500"}`}>{status}</span>;
}

async function DashboardMetrics() {
  const { kpis, charts } = await getAdminDashboardStats();

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Players" value={kpis.totalPlayers.toLocaleString()} />
        <Kpi icon={UserCheck} label="Active Players (7d)" value={kpis.activePlayers.toLocaleString()} />
        <Kpi icon={Radio} label="Live Games" value={kpis.liveGames.toLocaleString()} accent={kpis.liveGames > 0} />
        <Kpi icon={Ticket} label="Today's Tickets" value={kpis.todaysTickets.toLocaleString()} />
        <Kpi icon={TrendingUp} label="Today's Revenue" value={formatETB(kpis.todaysRevenue)} />
        <Kpi icon={Award} label="Prize Payouts (all-time)" value={formatETB(kpis.prizePayouts)} />
        <Kpi icon={Landmark} label="Pending Withdrawals" value={formatETB(kpis.pendingWithdrawals)} accent={Number(kpis.pendingWithdrawals) > 0} />
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-ink-900">Last 14 days</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MiniBarChart label="Registrations" data={charts.registrations} />
          <MiniBarChart label="Ticket Sales" data={charts.ticketSales} prefix="ETB " color="#2563eb" />
          <MiniBarChart label="Deposits" data={charts.deposits} prefix="ETB " color="#16a34a" />
          <MiniBarChart label="Withdrawals" data={charts.withdrawals} prefix="ETB " color="#dc2626" />
          <MiniBarChart label="Platform Revenue" data={charts.platformRevenue} prefix="ETB " color="#7c3aed" />
          <MiniBarChart label="Winnings Paid" data={charts.winnings} prefix="ETB " color="#d97706" />
          <MiniBarChart label="Games Created" data={charts.gamesCreated} color="#0891b2" />
        </div>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: boolean }) {
  return (
    <div className="card">
      <div className="mb-1 flex items-center gap-1.5 text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-xl font-bold ${accent ? "text-brand-700" : "text-ink-900"}`}>{value}</p>
    </div>
  );
}
