"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Clock, Loader2, Wallet, XCircle } from "lucide-react";
import clsx from "clsx";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

type ProviderId = "TELEBIRR" | "CBE" | "CHAPA" | "ARIFPAY" | "MPESA" | "MOCK";

interface ProviderOption {
  id: ProviderId;
  label: string;
  available: boolean;
  description: string;
}

interface Config {
  limits: { min: number; max: number };
  providers: ProviderOption[];
  currency: string;
}

interface Payment {
  id: string;
  provider: ProviderId;
  amount: string;
  currency: string;
  status: "INITIATED" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED" | "REVERSED";
  failureReason: string | null;
  createdAt: string;
}

const OPEN_STATUSES = new Set(["INITIATED", "PENDING"]);
const CREATE_ENDPOINT: Record<ProviderId, string> = {
  MOCK: "/api/payments/mock/create",
  TELEBIRR: "/api/payments/telebirr/create",
  CBE: "/api/payments/cbe/create",
  CHAPA: "/api/payments/chapa/create",
  ARIFPAY: "/api/payments/arifpay/create",
  MPESA: "/api/payments/mpesa/create",
};

export function DepositForm() {
  const [config, setConfig] = useState<Config | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTestControls, setShowTestControls] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiGet<{ limits: Config["limits"]; providers: ProviderOption[]; currency: string }>("/api/payments/config").then((cfg) => {
      setConfig(cfg);
      const firstAvailable = cfg.providers.find((p) => p.available) ?? cfg.providers[0];
      setSelectedProvider(firstAvailable?.id ?? null);
    });
    refreshBalance();
  }, []);

  useEffect(() => {
    if (payment && OPEN_STATUSES.has(payment.status)) {
      // Interim polling until the Phase 9 realtime service pushes payment
      // status over WebSocket — documented limitation, not a placeholder.
      pollRef.current = setInterval(async () => {
        const res = await apiGet<{ payment: Payment }>(`/api/payments/${payment.id}`);
        setPayment(res.payment);
        if (!OPEN_STATUSES.has(res.payment.status)) {
          refreshBalance();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 1500);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    // Deliberately keyed on id/status only, not the whole `payment` object —
    // setPayment(res.payment) below creates a new object every tick, which
    // would otherwise tear down and restart this interval every 1.5s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id, payment?.status]);

  async function refreshBalance() {
    const res = await apiGet<{ wallet: { availableBalance: string } | null }>("/api/wallet");
    setBalance(res.wallet?.availableBalance ?? "0");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!selectedProvider) return;
    setLoading(true);
    try {
      const res = await apiPost<{ payment: Payment }>(CREATE_ENDPOINT[selectedProvider], { amount: Number(amount) });
      setPayment(res.payment);
      // DEMO balance should feel instant, like a real deposit that just
      // cleared — the mock provider still goes through the exact same
      // create -> simulate -> callback path real providers use (proving
      // idempotency etc.), we just trigger the "success" step automatically
      // instead of making every demo player click through it. Manual
      // control over other outcomes (pending/failed/etc.) is still
      // available below for testing.
      if (res.payment.provider === "MOCK") {
        await simulate("SUCCESS", 1, res.payment.id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function simulate(outcome: "SUCCESS" | "PENDING" | "FAILED" | "CANCELLED" | "EXPIRED", repeat = 1, paymentId?: string) {
    const id = paymentId ?? payment?.id;
    if (!id) return;
    setSimulating(true);
    try {
      const res = await apiPost<{ payment: Payment }>(`/api/payments/mock/${id}/simulate`, { outcome, repeat });
      setPayment(res.payment);
      if (!OPEN_STATUSES.has(res.payment.status)) refreshBalance();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }

  if (!config) {
    return (
      <div className="card flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Wallet className="h-4 w-4" /> Current balance
        </div>
        <p className="text-lg font-bold text-ink-900">
          {config.currency} {balance ?? "…"}
        </p>
      </div>

      {!payment ? (
        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div>
            <label className="label" htmlFor="amount">
              Amount ({config.currency})
            </label>
            <input
              id="amount"
              type="number"
              min={config.limits.min}
              max={config.limits.max}
              step="0.01"
              required
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${config.limits.min} - ${config.limits.max}`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Minimum {config.currency} {config.limits.min}, maximum {config.currency} {config.limits.max}.
            </p>
          </div>

          <div>
            <span className="label">Payment method</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {config.providers.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  disabled={!p.available}
                  className={clsx(
                    "rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                    selectedProvider === p.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 hover:bg-slate-50",
                    !p.available && "cursor-not-allowed opacity-50",
                  )}
                >
                  <p className="font-semibold">{p.label}</p>
                  <p className={clsx("text-xs", p.available ? "text-slate-500" : "text-slate-400")}>{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          <SubmitButton type="submit" loading={loading} disabled={!selectedProvider}>
            Deposit
          </SubmitButton>
        </form>
      ) : (
        <div className="card space-y-4">
          <PaymentStatusCard payment={payment} currency={config.currency} />

          {payment.provider === "MOCK" && OPEN_STATUSES.has(payment.status) && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Confirming your DEMO deposit…
            </div>
          )}

          {payment.provider === "MOCK" && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-600"
                onClick={() => setShowTestControls((v) => !v)}
              >
                {showTestControls ? "Hide" : "Show"} testing controls
              </button>
              {showTestControls && (
                <div className="mt-3 space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Simulate a different outcome (QA only)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" disabled={simulating} onClick={() => simulate("SUCCESS")}>
                      Success
                    </button>
                    <button className="btn-secondary" disabled={simulating} onClick={() => simulate("PENDING")}>
                      Pending
                    </button>
                    <button className="btn-secondary" disabled={simulating} onClick={() => simulate("FAILED")}>
                      Failed
                    </button>
                    <button className="btn-secondary" disabled={simulating} onClick={() => simulate("CANCELLED")}>
                      Cancelled
                    </button>
                    <button className="btn-secondary" disabled={simulating} onClick={() => simulate("EXPIRED")}>
                      Expired
                    </button>
                  </div>
                  {payment.status === "SUCCESS" && (
                    <button
                      className="btn-ghost text-xs"
                      disabled={simulating}
                      onClick={() => simulate("SUCCESS", 5)}
                      title="Sends 5 more identical callbacks to prove idempotency — balance should not change."
                    >
                      Send 5 duplicate callbacks (proves your balance won&apos;t change)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!OPEN_STATUSES.has(payment.status) && (
            <button
              className="btn-secondary w-full"
              onClick={() => {
                setPayment(null);
                setAmount("");
                setShowTestControls(false);
              }}
            >
              Make another deposit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_META: Record<Payment["status"], { icon: React.ReactNode; label: string; className: string }> = {
  INITIATED: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: "Initiated", className: "text-slate-500" },
  PENDING: { icon: <Clock className="h-4 w-4" />, label: "Pending", className: "text-amber-600" },
  SUCCESS: { icon: <CheckCircle2 className="h-4 w-4" />, label: "Successful", className: "text-brand-700" },
  FAILED: { icon: <XCircle className="h-4 w-4" />, label: "Failed", className: "text-red-600" },
  CANCELLED: { icon: <XCircle className="h-4 w-4" />, label: "Cancelled", className: "text-slate-500" },
  EXPIRED: { icon: <XCircle className="h-4 w-4" />, label: "Expired", className: "text-slate-500" },
  REVERSED: { icon: <XCircle className="h-4 w-4" />, label: "Reversed", className: "text-red-600" },
};

function PaymentStatusCard({ payment, currency }: { payment: Payment; currency: string }) {
  const meta = STATUS_META[payment.status];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">Payment status</h2>
        <span className={clsx("flex items-center gap-1.5 text-sm font-semibold", meta.className)}>
          {meta.icon}
          {meta.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Payment ID" value={payment.id} mono />
        <Field label="Amount" value={`${currency} ${payment.amount}`} />
        <Field label="Provider" value={payment.provider} />
        <Field label="Created" value={new Date(payment.createdAt).toLocaleString()} />
      </dl>
      {payment.failureReason && <p className="mt-3 text-sm text-red-600">{payment.failureReason}</p>}
      {OPEN_STATUSES.has(payment.status) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Waiting for confirmation…
        </p>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={clsx("font-medium text-ink-900", mono && "break-all font-mono text-xs")}>{value}</dd>
    </div>
  );
}
