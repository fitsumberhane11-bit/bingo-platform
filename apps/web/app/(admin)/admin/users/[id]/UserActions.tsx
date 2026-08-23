"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";

export function UserActions({ userId, status, canSuspend, canActivate }: { userId: string; status: string; canSuspend: boolean; canActivate: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suspend() {
    const reason = window.prompt("Reason for suspending this user (required):");
    if (!reason || reason.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      await apiPost(`/api/admin/users/${userId}/suspend`, { reason: reason.trim() });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  async function activate() {
    setLoading(true);
    setError(null);
    try {
      await apiPost(`/api/admin/users/${userId}/activate`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {status !== "SUSPENDED" && status !== "BANNED" && canSuspend && (
          <button className="btn-danger" disabled={loading} onClick={suspend}>
            Suspend user
          </button>
        )}
        {status !== "ACTIVE" && status !== "BANNED" && canActivate && (
          <button className="btn-primary" disabled={loading} onClick={activate}>
            Activate user
          </button>
        )}
        {status === "BANNED" && <p className="text-sm text-slate-400">Banned users cannot be reactivated from this screen.</p>}
      </div>
    </div>
  );
}
