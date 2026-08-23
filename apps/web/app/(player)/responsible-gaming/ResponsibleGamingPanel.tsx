"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

interface Limits {
  dailyDepositLimit: string | null;
  weeklyDepositLimit: string | null;
  dailySpendLimit: string | null;
  weeklySpendLimit: string | null;
  pendingIncreaseEffectiveAt: string | null;
  coolingOffUntil: string | null;
  selfExcludedUntil: string | null;
}

function LimitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">ETB</span>
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="No limit"
          className="input"
        />
      </div>
    </label>
  );
}

export function ResponsibleGamingPanel({ initialLimits }: { initialLimits: Limits }) {
  const [limits, setLimits] = useState(initialLimits);
  const [form, setForm] = useState({
    dailyDepositLimit: initialLimits.dailyDepositLimit ?? "",
    weeklyDepositLimit: initialLimits.weeklyDepositLimit ?? "",
    dailySpendLimit: initialLimits.dailySpendLimit ?? "",
    weeklySpendLimit: initialLimits.weeklySpendLimit ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [coolingOffHours, setCoolingOffHours] = useState(24);
  const [exclusionDays, setExclusionDays] = useState(30);
  const [confirmExclusion, setConfirmExclusion] = useState(false);
  const [busy, setBusy] = useState<"cooling" | "exclusion" | null>(null);

  async function refresh() {
    const res = await apiGet<{ limits: Limits }>("/api/responsible-gaming");
    setLimits(res.limits);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        dailyDepositLimit: form.dailyDepositLimit === "" ? null : Number(form.dailyDepositLimit),
        weeklyDepositLimit: form.weeklyDepositLimit === "" ? null : Number(form.weeklyDepositLimit),
        dailySpendLimit: form.dailySpendLimit === "" ? null : Number(form.dailySpendLimit),
        weeklySpendLimit: form.weeklySpendLimit === "" ? null : Number(form.weeklySpendLimit),
      };
      const res = await apiPost<{ limits: Limits }>("/api/responsible-gaming", payload);
      setLimits(res.limits);
      setSuccess("Limits saved. Lowering a limit applies immediately; raising or removing one takes effect in 24 hours.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save limits.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCoolingOff() {
    setBusy("cooling");
    setError(null);
    try {
      await apiPost("/api/responsible-gaming/cooling-off", { hours: coolingOffHours });
      await refresh();
      setSuccess("Cooling-off period started. This cannot be cancelled early.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to start cooling-off.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSelfExclusion() {
    setBusy("exclusion");
    setError(null);
    try {
      await apiPost("/api/responsible-gaming/self-exclude", { days: exclusionDays });
      await refresh();
      setSuccess("Self-exclusion started. Contact support if you need to lift it early.");
      setConfirmExclusion(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to start self-exclusion.");
    } finally {
      setBusy(null);
    }
  }

  const now = new Date();
  const isExcluded = limits.selfExcludedUntil && new Date(limits.selfExcludedUntil) > now;
  const isCoolingOff = limits.coolingOffUntil && new Date(limits.coolingOffUntil) > now;

  return (
    <div className="space-y-6">
      {(isExcluded || isCoolingOff) && (
        <Alert variant="error">
          {isExcluded
            ? `Your account is self-excluded until ${new Date(limits.selfExcludedUntil!).toLocaleDateString()}. Deposits and ticket purchases are blocked.`
            : `You're in a cooling-off period until ${new Date(limits.coolingOffUntil!).toLocaleString()}. Deposits and ticket purchases are blocked.`}
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="card">
        <h2 className="mb-1 font-semibold text-ink-900">Spending limits</h2>
        <p className="mb-4 text-sm text-slate-500">
          Set optional limits on how much you can deposit or spend on tickets. Leave blank for no limit.
        </p>
        {limits.pendingIncreaseEffectiveAt && new Date(limits.pendingIncreaseEffectiveAt) > now && (
          <p className="mb-4 text-xs font-medium text-amber-600">
            A pending limit increase takes effect on {new Date(limits.pendingIncreaseEffectiveAt).toLocaleString()}.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <LimitField label="Daily deposit limit" value={form.dailyDepositLimit} onChange={(v) => setForm((f) => ({ ...f, dailyDepositLimit: v }))} />
          <LimitField label="Weekly deposit limit" value={form.weeklyDepositLimit} onChange={(v) => setForm((f) => ({ ...f, weeklyDepositLimit: v }))} />
          <LimitField label="Daily spending limit" value={form.dailySpendLimit} onChange={(v) => setForm((f) => ({ ...f, dailySpendLimit: v }))} />
          <LimitField label="Weekly spending limit" value={form.weeklySpendLimit} onChange={(v) => setForm((f) => ({ ...f, weeklySpendLimit: v }))} />
        </div>
        <div className="mt-4">
          <SubmitButton onClick={handleSave} loading={saving}>
            Save limits
          </SubmitButton>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-ink-900">Cooling-off period</h2>
        <p className="mb-4 text-sm text-slate-500">
          Take a short break — deposits and ticket purchases are blocked until it ends. Cannot be cancelled early.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={coolingOffHours}
            onChange={(e) => setCoolingOffHours(Number(e.target.value))}
            aria-label="Cooling-off duration"
            className="input w-auto"
          >
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
            <option value={720}>30 days</option>
          </select>
          <SubmitButton onClick={handleCoolingOff} loading={busy === "cooling"} variant="secondary" className="w-auto">
            Start cooling-off
          </SubmitButton>
        </div>
      </div>

      <div className="card border-red-200">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" /> Self-exclusion
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Block yourself from depositing or buying tickets for an extended period. This is <strong>not reversible by you</strong> —
          you would need to contact support to lift it early.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={exclusionDays}
            onChange={(e) => setExclusionDays(Number(e.target.value))}
            aria-label="Self-exclusion duration"
            className="input w-auto"
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>6 months</option>
            <option value={365}>1 year</option>
          </select>
          {!confirmExclusion ? (
            <button type="button" onClick={() => setConfirmExclusion(true)} className="btn-secondary border-red-300 text-red-700 hover:bg-red-50">
              Self-exclude
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-700">Are you sure?</span>
              <SubmitButton onClick={handleSelfExclusion} loading={busy === "exclusion"} variant="danger" className="w-auto">
                Yes, self-exclude
              </SubmitButton>
              <button type="button" onClick={() => setConfirmExclusion(false)} className="text-sm text-slate-500">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Read more on our{" "}
        <a href="/legal/responsible-gaming" className="underline hover:text-slate-600">
          Responsible Gaming
        </a>{" "}
        page.
      </p>
    </div>
  );
}
