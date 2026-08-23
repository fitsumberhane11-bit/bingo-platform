"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiClientError } from "@/lib/api-client";

type Status = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "CANCELLED";

export function WithdrawalActions({
  withdrawalId,
  status,
  canApprove,
  canReject,
}: {
  withdrawalId: string;
  status: Status;
  canApprove: boolean;
  canReject: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(endpoint: string, body?: unknown) {
    setLoading(endpoint);
    setError(null);
    try {
      await apiPost(`/api/admin/withdrawals/${withdrawalId}/${endpoint}`, body);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Action failed.");
    } finally {
      setLoading(null);
    }
  }

  function reject() {
    const reason = window.prompt("Reason for rejecting this withdrawal (required):");
    if (!reason || reason.trim().length < 3) return;
    act("reject", { reason: reason.trim() });
  }

  const buttons: React.ReactNode[] = [];
  if ((status === "REQUESTED" || status === "UNDER_REVIEW") && canApprove) {
    buttons.push(
      <button key="approve" className="btn-ghost px-2 py-1 text-xs text-brand-700" disabled={!!loading} onClick={() => act("approve")}>
        Approve
      </button>,
    );
  }
  if (status === "APPROVED" && canApprove) {
    buttons.push(
      <button key="processing" className="btn-ghost px-2 py-1 text-xs text-brand-700" disabled={!!loading} onClick={() => act("processing")}>
        Mark Processing
      </button>,
    );
  }
  if ((status === "APPROVED" || status === "PROCESSING") && canApprove) {
    buttons.push(
      <button key="complete" className="btn-ghost px-2 py-1 text-xs text-brand-700" disabled={!!loading} onClick={() => act("complete")}>
        Mark Completed
      </button>,
    );
  }
  if ((status === "REQUESTED" || status === "UNDER_REVIEW" || status === "APPROVED" || status === "PROCESSING") && canReject) {
    buttons.push(
      <button key="reject" className="btn-ghost px-2 py-1 text-xs text-red-600" disabled={!!loading} onClick={reject}>
        Reject
      </button>,
    );
  }

  if (buttons.length === 0) return <span className="text-xs text-slate-300">—</span>;

  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1">{buttons}</div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
