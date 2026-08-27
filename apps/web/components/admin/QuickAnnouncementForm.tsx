"use client";

import { useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";

/** Standalone platform-wide announcement composer for the operator dashboard — same endpoint ControlPanel's per-game form uses, just always targetType "ALL". */
export function QuickAnnouncementForm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await apiPost("/api/admin/announcements", { message, type: "IMPORTANT", targetType: "ALL" });
      setMessage("");
      setOpen(false);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to send announcement.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
          <Megaphone className="h-4 w-4" /> Send announcement
        </button>
        {sent && (
          <div className="mt-2">
            <Alert variant="success">Announcement sent.</Alert>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Announcement to all players</p>
      {error && (
        <div className="mb-2">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      <textarea
        className="input mb-3"
        placeholder="Welcome to tonight's Bingo!"
        aria-label="Announcement message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={1000}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={message.trim().length < 1 || sending} onClick={send}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
