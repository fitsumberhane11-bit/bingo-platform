"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await apiPost<{ message: string }>("/api/auth/forgot-password", {
        identifier: String(form.get("identifier") ?? ""),
      });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
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
        <h1 className="mb-1 text-xl font-bold text-ink-900">Reset your password</h1>
        <p className="mb-6 text-sm text-slate-500">Enter the email or phone linked to your account.</p>

        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {message ? (
          <Alert variant="success">{message}</Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField label="Email or phone" name="identifier" required />
            <SubmitButton type="submit" loading={loading}>
              Send reset link
            </SubmitButton>
          </form>
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
