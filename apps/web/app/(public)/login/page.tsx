"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      identifier: String(form.get("identifier") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    try {
      const res = await apiPost<{ twoFactorRequired?: boolean; challengeToken?: string; landingPath?: string }>("/api/auth/login", payload);
      if (res.twoFactorRequired && res.challengeToken) {
        setChallengeToken(res.challengeToken);
        return;
      }
      router.push(searchParams.get("next") ?? res.landingPath ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactorSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ landingPath?: string }>("/api/auth/2fa/verify", { challengeToken, code: twoFactorCode });
      router.push(searchParams.get("next") ?? res.landingPath ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  if (challengeToken) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-6 flex justify-center">
          <BrandMark size="lg" />
        </div>
        <div className="card">
          <h1 className="mb-1 text-xl font-bold text-ink-900">Two-factor verification</h1>
          <p className="mb-6 text-sm text-slate-500">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
          {formError && (
            <div className="mb-4">
              <Alert variant="error">{formError}</Alert>
            </div>
          )}
          <form onSubmit={handleTwoFactorSubmit} className="space-y-4" noValidate>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              placeholder="000000"
              aria-label="Verification code"
              className="input text-center font-mono text-lg tracking-widest"
            />
            <SubmitButton type="submit" loading={loading}>
              Verify
            </SubmitButton>
          </form>
          <button type="button" onClick={() => setChallengeToken(null)} className="mt-4 text-center text-sm text-slate-500">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <div className="card">
        <h1 className="mb-1 text-xl font-bold text-ink-900">Welcome back</h1>
        <p className="mb-6 text-sm text-slate-500">Log in to play and manage your wallet.</p>

        {formError && (
          <div className="mb-4">
            <Alert variant="error">{formError}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField label="Username, email, or phone" name="identifier" required autoComplete="username" />
          <div>
            <FormField label="Password" name="password" type="password" required autoComplete="current-password" />
            <div className="mt-1.5 text-right">
              <Link href="/forgot-password" className="text-xs font-medium text-brand-700">
                Forgot password?
              </Link>
            </div>
          </div>
          <SubmitButton type="submit" loading={loading}>
            Log in
          </SubmitButton>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-brand-700">
          Sign up
        </Link>
      </p>
    </div>
  );
}
