"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Ban, Clock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import clsx from "clsx";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

type ProviderId = "TELEBIRR" | "CBE";
type WithdrawalStatus = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "CANCELLED";

interface Withdrawal {
  id: string;
  amount: string;
  provider: ProviderId;
  destinationAccount: string;
  status: WithdrawalStatus;
  reason: string | null;
  createdAt: string;
}

const CANCELLABLE = new Set<WithdrawalStatus>(["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"]);

const STATUS_META: Record<WithdrawalStatus, { icon: React.ReactNode; className: string }> = {
  REQUESTED: { icon: <Clock className="h-4 w-4" />, className: "text-amber-600" },
  UNDER_REVIEW: { icon: <Clock className="h-4 w-4" />, className: "text-amber-600" },
  APPROVED: { icon: <CheckCircle2 className="h-4 w-4" />, className: "text-brand-600" },
  PROCESSING: { icon: <Loader2 className="h-4 w-4 animate-spin" />, className: "text-brand-600" },
  COMPLETED: { icon: <CheckCircle2 className="h-4 w-4" />, className: "text-brand-700" },
  REJECTED: { icon: <XCircle className="h-4 w-4" />, className: "text-red-600" },
  CANCELLED: { icon: <Ban className="h-4 w-4" />, className: "text-slate-500" },
};

export function WithdrawForm() {
  const [limits, setLimits] = useState<{ min: number; max: number; dailyLimit: number } | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<ProviderId>("TELEBIRR");
  const [destinationAccount, setDestinationAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [limitsRes, walletRes, withdrawalsRes] = await Promise.all([
      apiGet<{ limits: { min: number; max: number; dailyLimit: number } }>("/api/wallet/withdraw"),
      apiGet<{ wallet: { availableBalance: string } | null }>("/api/wallet"),
      apiGet<{ items: Withdrawal[] }>("/api/wallet/withdrawals"),
    ]);
    setLimits(limitsRes.limits);
    setBalance(walletRes.wallet?.availableBalance ?? "0");
    setWithdrawals(withdrawalsRes.items);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await apiPost("/api/wallet/withdraw", { amount: Number(amount), provider, destinationAccount });
      setSuccess("Withdrawal request submitted. It will be reviewed by our Finance team.");
      setAmount("");
      setDestinationAccount("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelWithdrawal(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      await apiPost(`/api/wallet/withdrawals/${id}/cancel`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not cancel this withdrawal.");
    } finally {
      setCancellingId(null);
    }
  }

  if (!limits) {
    return (
      <div className="card flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <span className="font-semibold">DEMO MODE — NO REAL MONEY.</span> Withdrawals are reviewed by Finance and
        simulated end-to-end (Telebirr and CBE are not yet connected to a live payment network). No real funds ever
        leave the platform in this mode.
      </Alert>

      <div className="card flex items-center justify-between">
        <p className="text-sm text-slate-500">Available balance</p>
        <p className="text-lg font-bold text-ink-900">ETB {balance ?? "…"}</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <div>
          <label className="label" htmlFor="amount">
            Amount (ETB)
          </label>
          <input
            id="amount"
            type="number"
            min={limits.min}
            max={limits.max}
            step="0.01"
            required
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`${limits.min} - ${limits.max}`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Minimum ETB {limits.min}, maximum ETB {limits.max} per request. Daily limit ETB {limits.dailyLimit}.
          </p>
        </div>

        <div>
          <span className="label">Method</span>
          <div className="grid grid-cols-2 gap-2">
            {(["TELEBIRR", "CBE"] as const).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setProvider(p)}
                className={clsx(
                  "rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                  provider === p ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                {p === "TELEBIRR" ? "Telebirr" : "Commercial Bank of Ethiopia"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="destination">
            {provider === "TELEBIRR" ? "Telebirr phone number" : "CBE account number"}
          </label>
          <input
            id="destination"
            type="text"
            required
            minLength={3}
            className="input"
            value={destinationAccount}
            onChange={(e) => setDestinationAccount(e.target.value)}
            placeholder={provider === "TELEBIRR" ? "+2519XXXXXXXX" : "1000XXXXXXXX"}
          />
        </div>

        <SubmitButton type="submit" loading={loading}>
          Request Withdrawal
        </SubmitButton>
      </form>

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink-900">Your withdrawal requests</h2>
        {withdrawals.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No withdrawal requests yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {withdrawals.map((w) => {
              const meta = STATUS_META[w.status];
              return (
                <li key={w.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-ink-900">
                      ETB {w.amount} · {w.provider === "TELEBIRR" ? "Telebirr" : "CBE"}
                    </p>
                    <p className="text-xs text-slate-400">{new Date(w.createdAt).toLocaleString()}</p>
                    {w.reason && w.status === "REJECTED" && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" /> {w.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx("flex items-center gap-1.5 font-semibold", meta.className)}>
                      {meta.icon}
                      {w.status.replace("_", " ")}
                    </span>
                    {CANCELLABLE.has(w.status) && (
                      <button
                        className="btn-ghost text-xs"
                        disabled={cancellingId === w.id}
                        onClick={() => cancelWithdrawal(w.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
