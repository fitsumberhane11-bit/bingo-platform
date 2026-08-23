import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { Alert } from "@/components/ui/Alert";
import { ReconcileButton } from "../ReconcileButton";
import { notFound } from "next/navigation";

export const metadata = { title: "Payment detail" };

const NON_TERMINAL = new Set(["INITIATED", "PENDING", "PENDING_RECONCILIATION"]);

export default async function AdminPaymentDetailPage({ params }: { params: { paymentId: string } }) {
  const current = await getCurrentUser();
  const ctx = await loadAccessContext(current!.sub);

  if (!hasPermission(ctx, PERMISSIONS.PAYMENT_VIEW)) {
    return <Alert variant="error">You don&apos;t have permission to view payments.</Alert>;
  }

  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    include: {
      user: { select: { id: true, username: true, fullName: true, email: true } },
      walletTransactions: true,
      callbackLogs: { orderBy: { receivedAt: "asc" } },
    },
  });
  if (!payment) notFound();

  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Payment", entityId: payment.id },
    include: { actor: { select: { username: true } } },
    orderBy: { createdAt: "asc" },
  });

  const canReconcile = hasPermission(ctx, PERMISSIONS.PAYMENT_RECONCILE);

  return (
    <div className="space-y-6">
      <Link href="/admin/payments" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to payments
      </Link>

      <div className="card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink-900">Payment {payment.id}</h1>
            <p className="text-sm text-slate-500">
              {payment.user.fullName} (@{payment.user.username}, {payment.user.email})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={payment.status} />
            {canReconcile && NON_TERMINAL.has(payment.status) && <ReconcileButton paymentId={payment.id} />}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Field label="Amount" value={`ETB ${payment.amount.toString()}`} />
          <Field label="Provider" value={payment.provider} />
          <Field label="Currency" value={payment.currency} />
          <Field label="Provider order ref" value={payment.providerOrderId ?? "—"} mono />
          <Field label="Provider transaction ref" value={payment.providerTransactionId ?? "—"} mono />
          <Field label="Idempotency key" value={payment.idempotencyKey} mono />
          <Field label="Initiated" value={new Date(payment.createdAt).toLocaleString()} />
          <Field label="Verified at" value={payment.verifiedAt ? new Date(payment.verifiedAt).toLocaleString() : "—"} />
          <Field label="Last updated" value={new Date(payment.updatedAt).toLocaleString()} />
        </dl>
        {payment.failureReason && (
          <p className="mt-4">
            <Alert variant="error">{payment.failureReason}</Alert>
          </p>
        )}
      </div>

      {payment.walletTransactions.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-ink-900">Wallet ledger entry</h2>
          {payment.walletTransactions.map((tx) => (
            <dl key={tx.id} className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Field label="Type" value={tx.type} />
              <Field label="Amount" value={`ETB ${tx.amount.toString()}`} />
              <Field label="Balance before" value={`ETB ${tx.balanceBefore.toString()}`} />
              <Field label="Balance after" value={`ETB ${tx.balanceAfter.toString()}`} />
            </dl>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold text-ink-900">Callback history ({payment.callbackLogs.length})</h2>
        {payment.callbackLogs.length === 0 ? (
          <p className="text-sm text-slate-400">No callbacks received yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Received</th>
                <th className="py-2 pr-3">Signature</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {payment.callbackLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-3 text-slate-500">{new Date(log.receivedAt).toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    <span className={log.signatureValid ? "text-brand-700" : "text-red-600"}>
                      {log.signatureValid ? "Valid" : "Invalid"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <ResultBadge result={log.processedResult} />
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{log.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink-900">Audit trail ({auditLogs.length})</h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-slate-400">No audited actions yet.</p>
        ) : (
          <ul className="space-y-3">
            {auditLogs.map((log) => (
              <li key={log.id} className="border-b border-slate-50 pb-3 text-sm last:border-0">
                <p className="font-medium text-ink-900">
                  {log.action} {log.actor && <span className="text-slate-400">by @{log.actor.username}</span>}
                </p>
                <p className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
                {(log.oldValue || log.newValue) && (
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    {JSON.stringify({ old: log.oldValue, new: log.newValue }, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`font-medium text-ink-900 ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</dd>
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
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] ?? "bg-slate-100"}`}>{status}</span>;
}

function ResultBadge({ result }: { result: string }) {
  const isGood = result === "APPLIED";
  const isDuplicate = result === "DUPLICATE_IGNORED";
  const className = isGood ? "text-brand-700" : isDuplicate ? "text-slate-500" : "text-red-600";
  return <span className={className}>{result}</span>;
}
