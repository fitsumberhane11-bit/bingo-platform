import { Suspense } from "react";
import Link from "next/link";
import { prisma, type Prisma, type PaymentStatus, type PaymentProviderType } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { Alert } from "@/components/ui/Alert";
import { ReconcileButton } from "./ReconcileButton";
import { PaymentFilters } from "./PaymentFilters";

export const metadata = { title: "Payments" };

const NON_TERMINAL = new Set(["INITIATED", "PENDING", "PENDING_RECONCILIATION"]);
const PAGE_SIZE = 30;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string; provider?: string; user?: string; page?: string };
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);

  if (!hasPermission(ctx, PERMISSIONS.PAYMENT_VIEW)) {
    return (
      <Alert variant="error">
        You don&apos;t have permission to view payments. This section is restricted to Finance and Admin roles.
      </Alert>
    );
  }

  const canReconcile = hasPermission(ctx, PERMISSIONS.PAYMENT_RECONCILE);
  const page = Math.max(1, Number(searchParams.page ?? "1"));

  const where: Prisma.PaymentWhereInput = {
    ...(searchParams.status ? { status: searchParams.status as PaymentStatus } : {}),
    ...(searchParams.provider ? { provider: searchParams.provider as PaymentProviderType } : {}),
    ...(searchParams.user
      ? { user: { username: { contains: searchParams.user, mode: "insensitive" as const } } }
      : {}),
  };

  const [summary, payments, total] = await Promise.all([
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { username: true, fullName: true } } },
    }),
    prisma.payment.count({ where }),
  ]);

  const totalDeposited = summary.find((s) => s.status === "SUCCESS")?._sum.amount?.toString() ?? "0";
  const countByStatus = Object.fromEntries(summary.map((s) => [s.status, s._count._all]));
  const pendingCount =
    (countByStatus.PENDING ?? 0) + (countByStatus.INITIATED ?? 0) + (countByStatus.PENDING_RECONCILIATION ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Payments</h1>
        <p className="text-sm text-slate-500">All deposit attempts across every provider.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total deposited (successful)" value={`ETB ${totalDeposited}`} />
        <StatCard label="Pending / needs reconciliation" value={String(pendingCount)} />
        <StatCard label="Successful" value={String(countByStatus.SUCCESS ?? 0)} />
        <StatCard
          label="Failed / cancelled / expired"
          value={String((countByStatus.FAILED ?? 0) + (countByStatus.CANCELLED ?? 0) + (countByStatus.EXPIRED ?? 0))}
        />
      </div>

      <Suspense>
        <PaymentFilters />
      </Suspense>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">User</th>
              <th className="py-2 pr-3">Provider</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Reference</th>
              <th className="py-2 pr-3">Created</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3">
                  <Link href={`/admin/payments/${p.id}`} className="font-medium text-ink-900 hover:underline">
                    {p.user.fullName}
                  </Link>
                  <p className="text-xs text-slate-400">@{p.user.username}</p>
                </td>
                <td className="py-2 pr-3">{p.provider}</td>
                <td className="py-2 pr-3 font-semibold">ETB {p.amount.toString()}</td>
                <td className="py-2 pr-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{p.providerOrderId ?? "—"}</td>
                <td className="py-2 pr-3 text-xs text-slate-400">{new Date(p.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/payments/${p.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                      View
                    </Link>
                    {canReconcile && NON_TERMINAL.has(p.status) && <ReconcileButton paymentId={p.id} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No payments match these filters.</p>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <PageLink key={p} page={p} active={p === page} searchParams={searchParams} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  active,
  searchParams,
}: {
  page: number;
  active: boolean;
  searchParams: { status?: string; provider?: string; user?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.provider) params.set("provider", searchParams.provider);
  if (searchParams.user) params.set("user", searchParams.user);
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/payments?${params.toString()}`}
      className={`rounded-lg px-3 py-1.5 font-medium ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {page}
    </Link>
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
    SUCCESS: "bg-brand-50 text-brand-700",
    PENDING: "bg-amber-50 text-amber-700",
    PENDING_RECONCILIATION: "bg-orange-50 text-orange-700",
    INITIATED: "bg-slate-100 text-slate-600",
    FAILED: "bg-red-50 text-red-700",
    CANCELLED: "bg-slate-100 text-slate-500",
    EXPIRED: "bg-slate-100 text-slate-500",
    REVERSED: "bg-red-50 text-red-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-100"}`}>{status}</span>;
}
