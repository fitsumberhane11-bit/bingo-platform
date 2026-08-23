import Link from "next/link";
import { Users, UserCheck, Radio, Ticket, TrendingUp, Award, Landmark } from "lucide-react";
import { PERMISSIONS } from "@bingo/shared-types";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { getAdminDashboardStats } from "@/lib/reports/admin-dashboard";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { formatETB } from "@/lib/format";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminHomePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);
  const canViewReports = hasPermission(ctx, PERMISSIONS.REPORTS_VIEW);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500">
          {canViewReports
            ? "Live platform metrics, computed from the database on every page load."
            : "Financial metrics are restricted to Finance and Admin roles."}
        </p>
      </div>

      {canViewReports && <DashboardMetrics />}

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
        <Link href="/admin/finance" className="card flex items-center gap-3 hover:bg-slate-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Landmark className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-semibold text-ink-900">Finance</span>
            <span className="block text-sm text-slate-500">Full financial reconciliation and consistency checks.</span>
          </span>
        </Link>
      </div>
    </div>
  );
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
