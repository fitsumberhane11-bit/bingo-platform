import { PERMISSIONS } from "@bingo/shared-types";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { getFinancialOverview } from "@/lib/reports/financial-reconciliation";
import { Alert } from "@/components/ui/Alert";

export const metadata = { title: "Financial Overview" };

export default async function AdminFinancePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);

  if (!hasPermission(ctx, PERMISSIONS.REPORTS_VIEW)) {
    return (
      <Alert variant="error">
        You don&apos;t have permission to view financial reports. This section is restricted to Finance and Admin roles.
      </Alert>
    );
  }

  const overview = await getFinancialOverview();
  const { consistencyCheck } = overview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Financial Overview</h1>
        <p className="text-sm text-slate-500">Platform-wide money flow, reconciled every page load.</p>
      </div>

      <div
        className={`card flex items-start gap-3 border-2 ${
          consistencyCheck.reconciled ? "border-brand-200 bg-brand-50" : "border-red-300 bg-red-50"
        }`}
      >
        {consistencyCheck.reconciled ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        )}
        <div>
          <p className={`font-semibold ${consistencyCheck.reconciled ? "text-brand-800" : "text-red-800"}`}>
            {consistencyCheck.reconciled ? "Books reconciled" : "Reconciliation mismatch — requires investigation"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{consistencyCheck.formula}</p>
          <p className="mt-1 text-xs text-slate-500">
            Expected held: ETB {consistencyCheck.expectedHeld} · Actual held: ETB {consistencyCheck.actualHeld}
            {!consistencyCheck.reconciled && <span className="font-semibold text-red-700"> · Delta: ETB {consistencyCheck.delta}</span>}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Deposits" value={`ETB ${overview.totalDeposits}`} />
        <StatCard label="Total Withdrawals" value={`ETB ${overview.totalWithdrawals}`} />
        <StatCard label="Ticket Revenue" value={`ETB ${overview.ticketRevenue}`} />
        <StatCard label="Prize Pool Liability" value={`ETB ${overview.prizePoolLiability}`} />
        <StatCard label="Prize Payouts" value={`ETB ${overview.prizePayouts}`} />
        <StatCard label="Platform Revenue" value={`ETB ${overview.platformRevenue}`} accent />
        <StatCard label="Refunds" value={`ETB ${overview.refunds}`} />
        <StatCard label="Outstanding Withdrawal Liability" value={`ETB ${overview.outstandingWithdrawalLiability}`} />
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold text-ink-900">How this reconciles</h2>
        <p className="text-sm text-slate-500">
          Wallet Ledger (every player&apos;s balance) + Payment Ledger (deposits/withdrawals) + Game Ledger (ticket
          sales, refunds) + Platform Ledger (fee revenue, prize-pool custody) must always sum to the same total money
          the platform has ever taken in via deposits, minus what it has ever paid out via completed withdrawals. The
          check above runs this exact identity against live data on every page load — it is not a cached or
          scheduled report.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ? "text-brand-700" : "text-ink-900"}`}>{value}</p>
    </div>
  );
}
