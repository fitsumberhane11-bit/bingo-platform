"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { apiPost, ApiClientError } from "@/lib/api-client";

export function ReconcileButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      await apiPost(`/api/admin/payments/${paymentId}/reconcile`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Reconciliation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button onClick={handleClick} disabled={loading} className="btn-ghost px-2 py-1 text-xs">
        <RefreshCw className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
        Reconcile
      </button>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
