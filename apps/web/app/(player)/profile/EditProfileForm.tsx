"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPatch, ApiClientError } from "@/lib/api-client";

export function EditProfileForm({ defaultFullName }: { defaultFullName: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiPatch("/api/profile", { fullName: String(form.get("fullName") ?? "") });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">Profile updated.</Alert>}
      <FormField label="Full name" name="fullName" defaultValue={defaultFullName} required />
      <SubmitButton type="submit" loading={loading} className="w-auto px-6">
        Save changes
      </SubmitButton>
    </form>
  );
}
