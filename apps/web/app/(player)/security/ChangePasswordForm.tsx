"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

export function ChangePasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrors({});
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/profile/change-password", {
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword: String(form.get("newPassword") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? ""),
      });
      router.push("/login");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.fieldErrors) setErrors(err.fieldErrors);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <FormField label="Current password" name="currentPassword" type="password" required autoComplete="current-password" />
      <FormField
        label="New password"
        name="newPassword"
        type="password"
        required
        autoComplete="new-password"
        error={errors.newPassword?.[0]}
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        required
        autoComplete="new-password"
        error={errors.confirmPassword?.[0]}
      />
      <SubmitButton type="submit" loading={loading} className="w-auto px-6">
        Update password
      </SubmitButton>
    </form>
  );
}
