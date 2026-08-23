import { Suspense } from "react";
import { prisma, type Prisma, type WithdrawalStatus, type PaymentProviderType } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { getWithdrawalAdminSummary, maskDestination } from "@/lib/withdrawal-service";
import { Alert } from "@/components/ui/Alert";
import { WithdrawalFilters } from "./WithdrawalFilters";
import { WithdrawalActions } from "./WithdrawalActions";

export const metadata = { title: "Withdrawals" };

const PAGE_SIZE = 30;

export default async function AdminWithdrawalsPage({
  searchParams,
}: {
  searchParams: { status?: string; provider?: string; minAmount?: string; maxAmount?: string; page?: string };
}) {
  const current = await getCurrentUser();
  const ctx = await loadAccessContext(current!.sub);

  if (!hasPermission(ctx, PERMISSIONS.WITHDRAWAL_VIEW)) {
    return (
      <Alert variant="error">
        You don&apos;t have permission to view withdrawals. This section is restricted to Finance and Admin roles.
      </Alert>
    );
  }

  const canApprove = hasPermission(ctx, PERMISSIONS.WITHDRAWAL_APPROVE);
  const canReject = hasPermission(ctx, PERMISSIONS.WITHDRAWAL_REJECT);
  const page = Math.max(1, Number(searchParams.page ?? "1"));

  const where: Prisma.WithdrawalWhereInput = {
    ...(searchParams.status ? { status: searchParams.status as WithdrawalStatus } : {}),
    ...(searchParams.provider ? { provider: searchParams.provider as PaymentProviderType } : {}),
    ...(searchParams.minAmount || searchParams.maxAmount
      ? {
          amount: {
            ...(searchParams.minAmount ? { gte: Number(searchParams.minAmount) } : {}),
            ...(searchParams.maxAmount ? { lte: Number(searchParams.maxAmount) } : {}),
          },
        }
      : {}),
  };

  const [summary, withdrawals, total] = await Promise.all([
    getWithdrawalAdminSummary(),
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { username: true, fullName: true } } },
    }),
    prisma.withdrawal.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Withdrawals</h1>
        <p className="text-sm text-slate-500">Review, approve, and process player withdrawal requests.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Pending review (${summary.pendingCount})`} value={`ETB ${summary.pendingTotal.toString()}`} />
        <StatCard label="Approved / processing" value={`ETB ${summary.approvedTotal.toString()}`} />
        <StatCard label="Total paid" value={`ETB ${summary.paidTotal.toString()}`} />
        <StatCard label="Total rejected" value={`ETB ${summary.rejectedTotal.toString()}`} />
      </div>

      <Suspense>
        <WithdrawalFilters />
      </Suspense>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3">Method</th>
              <th className="py-2 pr-3">Destination</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Requested</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3">
                  <p className="font-medium text-ink-900">{w.user.fullName}</p>
                  <p className="text-xs text-slate-400">@{w.user.username}</p>
                </td>
                <td className="py-2 pr-3">{w.provider}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{maskDestination(w.destinationAccount)}</td>
                <td className="py-2 pr-3 font-semibold">ETB {w.amount.toString()}</td>
                <td className="py-2 pr-3">
                  <StatusBadge status={w.status} />
                  {w.reason && w.status === "REJECTED" && <p className="mt-1 max-w-[16rem] text-xs text-slate-400">{w.reason}</p>}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-400">{new Date(w.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-3">
                  <WithdrawalActions withdrawalId={w.id} status={w.status} canApprove={canApprove} canReject={canReject} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {withdrawals.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No withdrawals match these filters.</p>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
          Page {page} of {totalPages}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    REQUESTED: "bg-amber-50 text-amber-700",
    UNDER_REVIEW: "bg-amber-50 text-amber-700",
    APPROVED: "bg-brand-50 text-brand-700",
    PROCESSING: "bg-brand-50 text-brand-700",
    COMPLETED: "bg-brand-100 text-brand-800",
    REJECTED: "bg-red-50 text-red-700",
    CANCELLED: "bg-slate-100 text-slate-500",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-100"}`}>{status.replace("_", " ")}</span>;
}
