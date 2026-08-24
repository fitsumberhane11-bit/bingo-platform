"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

interface RegisterResponse {
  user: { id: string; email: string };
  message: string;
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      fullName: String(form.get("fullName") ?? ""),
      username: String(form.get("username") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      referralCode: String(form.get("referralCode") ?? "") || undefined,
      acceptedTerms: form.get("acceptedTerms") === "on",
    };

    try {
      const res = await apiPost<RegisterResponse>("/api/auth/register", payload);
      setSuccess(res.message);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        if (err.fieldErrors) setErrors(err.fieldErrors);
      } else {
        setFormError("Something went wrong. Please try again.");
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
        <h1 className="mb-1 text-xl font-bold text-ink-900">Create your account</h1>
        <p className="mb-6 text-sm text-slate-500">Play live multiplayer Bingo with a free DEMO balance.</p>

        {formError && (
          <div className="mb-4">
            <Alert variant="error">{formError}</Alert>
          </div>
        )}
        {success && (
          <div className="mb-4">
            <Alert variant="success">{success}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField label="Full name" name="fullName" required autoComplete="name" error={errors.fullName?.[0]} />
          <FormField label="Username" name="username" required autoComplete="username" error={errors.username?.[0]} />
          <FormField label="Email" name="email" type="email" required autoComplete="email" error={errors.email?.[0]} />
          <FormField
            label="Phone number"
            name="phone"
            required
            placeholder="+251912345678"
            autoComplete="tel"
            hint="Ethiopian mobile number, e.g. +251912345678"
            error={errors.phone?.[0]}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 10 characters, with upper/lowercase, a number, and a symbol."
            error={errors.password?.[0]}
          />
          <FormField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            error={errors.confirmPassword?.[0]}
          />
          <FormField
            label="Referral code (optional)"
            name="referralCode"
            defaultValue={searchParams.get("ref") ?? ""}
            error={errors.referralCode?.[0]}
          />

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" name="acceptedTerms" required className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
            <span>
              I am 18 years or older and I agree to the{" "}
              <Link href="/legal/terms" className="font-medium text-brand-700 underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="font-medium text-brand-700 underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.acceptedTerms && <p className="field-error">{errors.acceptedTerms[0]}</p>}

          <SubmitButton type="submit" loading={loading}>
            Create account
          </SubmitButton>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700">
          Log in
        </Link>
      </p>
    </div>
  );
}
