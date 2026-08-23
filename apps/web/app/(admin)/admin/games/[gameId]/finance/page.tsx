import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PERMISSIONS } from "@bingo/shared-types";
import { CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { getGameFinancialSummary } from "@/lib/reports/game-financial-summary";
import { NotFoundError } from "@/lib/errors";
import { Alert } from "@/components/ui/Alert";

export const metadata = { title: "Game Financial Summary" };

export default async function GameFinancePage({ params }: { params: { gameId: string } }) {
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

  let summary: Awaited<ReturnType<typeof getGameFinancialSummary>>;
  try {
    summary = await getGameFinancialSummary(params.gameId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const reconciled = summary.financialStatus === "RECONCILED";

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/games" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to games
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink-900">{summary.game.name}</h1>
        <p className="text-sm text-slate-500">
          {summary.game.status} · Created by {summary.game.createdBy.fullName} (@{summary.game.createdBy.username})
        </p>
      </div>

      <div
        className={`card flex items-start gap-3 border-2 ${reconciled ? "border-brand-200 bg-brand-50" : "border-red-300 bg-red-50"}`}
      >
        {reconciled ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        )}
        <div>
          <p className={`font-semibold ${reconciled ? "text-brand-800" : "text-red-800"}`}>
            Financial status: {summary.financialStatus}
          </p>
          {!reconciled && (
            <ul className="mt-1 space-y-0.5 text-xs text-red-700">
              {!summary.consistencyCheck.feeMatches && (
                <li>
                  Platform fee mismatch: recorded ETB {summary.platformShare}, recomputed ETB{" "}
                  {summary.consistencyCheck.recomputedFee}
                </li>
              )}
              {!summary.consistencyCheck.contributionMatches && (
                <li>
                  Prize pool mismatch: recorded ETB {summary.prizePool}, recomputed ETB{" "}
                  {summary.consistencyCheck.recomputedContribution}
                </li>
              )}
              {!summary.consistencyCheck.outstandingOk && (
                <li>Game is terminal but ETB {summary.outstanding} of prize-pool liability remains unaccounted for.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Field label="Tickets Sold" value={String(summary.ticketsSold)} />
          <Field label="Ticket Revenue" value={`ETB ${summary.ticketRevenue}`} />
          <Field label="Prize Pool" value={`ETB ${summary.prizePool}`} />
          <Field label="Platform Share" value={`ETB ${summary.platformShare}`} />
          <Field label="Refunds" value={`ETB ${summary.refunds}`} />
          <Field label="Prize Paid" value={`ETB ${summary.prizePaid}`} />
          <Field label="Forfeited to Platform" value={`ETB ${summary.forfeited}`} />
          <Field label="Outstanding" value={`ETB ${summary.outstanding}`} />
          <Field label="Platform Fee %" value={`${summary.game.platformFeePercent}%`} />
          <Field label="Winning Pattern" value={summary.game.winningPattern} />
          <Field label="Prize Rule" value={summary.game.prizeRuleName} />
        </dl>
      </div>

      {summary.winners.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-ink-900">Winners</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {summary.winners.map((w, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs text-slate-500">{w.userId}</span>
                <span className="font-semibold text-ink-900">ETB {w.prizeAmount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
