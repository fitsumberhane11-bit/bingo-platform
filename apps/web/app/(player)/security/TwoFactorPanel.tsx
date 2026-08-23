"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

interface Status {
  enabled: boolean;
  remainingRecoveryCodes: number;
}

export function TwoFactorPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Enrollment flow state
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeDataUri, setQrCodeDataUri] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Disable flow state
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);

  useEffect(() => {
    apiGet<Status>("/api/auth/2fa/status").then(setStatus).catch(() => {});
  }, []);

  async function startEnroll() {
    setError(null);
    setEnrolling(true);
    try {
      const res = await apiPost<{ secret: string; qrCodeDataUri: string }>("/api/auth/2fa/enroll");
      setSecret(res.secret);
      setQrCodeDataUri(res.qrCodeDataUri);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to start enrollment.");
      setEnrolling(false);
    }
  }

  async function confirmEnroll() {
    if (!secret) return;
    setError(null);
    setConfirming(true);
    try {
      const res = await apiPost<{ recoveryCodes: string[] }>("/api/auth/2fa/enroll/confirm", { secret, code: verifyCode });
      setRecoveryCodes(res.recoveryCodes);
      setStatus({ enabled: true, remainingRecoveryCodes: res.recoveryCodes.length });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Verification failed.");
    } finally {
      setConfirming(false);
    }
  }

  function finishEnrollment() {
    setEnrolling(false);
    setSecret(null);
    setQrCodeDataUri(null);
    setVerifyCode("");
    setRecoveryCodes(null);
  }

  async function handleDisable() {
    setError(null);
    setDisableBusy(true);
    try {
      await apiPost("/api/auth/2fa/disable", { currentPassword: disablePassword });
      setStatus({ enabled: false, remainingRecoveryCodes: 0 });
      setDisabling(false);
      setDisablePassword("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to disable 2FA.");
    } finally {
      setDisableBusy(false);
    }
  }

  if (!status) return null;

  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <Alert variant="success">Two-factor authentication is now enabled.</Alert>
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            Save these recovery codes now — each can be used once if you lose access to your authenticator app. They will not be shown again.
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm text-ink-900">
            {recoveryCodes.map((c) => (
              <span key={c} className="rounded bg-white px-2 py-1 text-center">
                {c}
              </span>
            ))}
          </div>
        </div>
        <SubmitButton onClick={finishEnrollment}>I&apos;ve saved my recovery codes</SubmitButton>
      </div>
    );
  }

  if (enrolling) {
    return (
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}
        <p className="text-sm text-slate-600">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the code manually.
        </p>
        {qrCodeDataUri && (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not a remote image; next/image can't optimize it anyway
          <img src={qrCodeDataUri} alt="2FA enrollment QR code" className="mx-auto h-40 w-40 rounded-lg border border-slate-200" />
        )}
        {secret && <p className="text-center font-mono text-xs text-slate-500">{secret}</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Enter the 6-digit code from your app</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
            className="input text-center font-mono text-lg tracking-widest"
            placeholder="000000"
          />
        </label>
        <div className="flex gap-2">
          <SubmitButton onClick={confirmEnroll} loading={confirming} disabled={verifyCode.length !== 6}>
            Verify and enable
          </SubmitButton>
          <button type="button" onClick={finishEnrollment} className="text-sm text-slate-500">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (status.enabled) {
    return (
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}
        <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
          <ShieldCheck className="h-4 w-4" /> Two-factor authentication is enabled ({status.remainingRecoveryCodes} recovery codes remaining)
        </p>
        {!disabling ? (
          <button type="button" onClick={() => setDisabling(true)} className="text-sm font-medium text-red-600 hover:underline">
            Disable two-factor authentication
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-600">Confirm your password to disable 2FA</span>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="input"
              />
            </label>
            <div className="flex gap-2">
              <SubmitButton onClick={handleDisable} loading={disableBusy} variant="danger" className="w-auto">
                Disable
              </SubmitButton>
              <button type="button" onClick={() => setDisabling(false)} className="text-sm text-slate-500">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <p className="flex items-center gap-1.5 text-sm text-slate-500">
        <ShieldOff className="h-4 w-4" /> Two-factor authentication is not enabled.
      </p>
      <SubmitButton onClick={startEnroll} className="w-auto">
        Set up two-factor authentication
      </SubmitButton>
    </div>
  );
}
