"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrors({});
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/auth/reset-password", {
        token,
        password: String(form.get("password") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? ""),
      });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.fieldErrors) setErrors(err.fieldErrors);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <div className="card">
        <h1 className="mb-1 text-xl font-bold text-ink-900">Choose a new password</h1>

        {!token && (
          <Alert variant="error">This link is missing a reset token. Please request a new one.</Alert>
        )}
        {error && (
          <div className="my-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {success ? (
          <Alert variant="success">Password updated. Redirecting to login…</Alert>
        ) : (
          token && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
              <FormField
                label="New password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                error={errors.password?.[0]}
              />
              <FormField
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                error={errors.confirmPassword?.[0]}
              />
              <SubmitButton type="submit" loading={loading}>
                Update password
              </SubmitButton>
            </form>
          )
        )}
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-brand-700">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
