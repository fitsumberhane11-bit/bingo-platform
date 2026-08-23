"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor } from "lucide-react";
import { apiGet, apiDelete } from "@/lib/api-client";
import { SubmitButton } from "@/components/ui/SubmitButton";

interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export function SessionsList() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    apiGet<{ sessions: SessionRow[]; currentSessionId: string }>("/api/profile/sessions").then((res) => {
      setSessions(res.sessions);
      setCurrentSessionId(res.currentSessionId);
    });
  }, []);

  async function revokeAll() {
    setRevoking(true);
    try {
      await apiDelete("/api/profile/sessions");
      router.push("/login");
      router.refresh();
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div>
      {!sessions ? (
        <p className="text-sm text-slate-400">Loading sessions…</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 text-sm last:border-0">
              <Monitor className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div>
                <p className="font-medium text-ink-900">
                  {s.userAgent ?? "Unknown device"} {s.id === currentSessionId && <span className="text-brand-600">(this device)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {s.ipAddress} · signed in {new Date(s.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <SubmitButton variant="danger" onClick={revokeAll} loading={revoking} className="mt-4 w-auto px-6">
        Log out of all devices
      </SubmitButton>
    </div>
  );
}
