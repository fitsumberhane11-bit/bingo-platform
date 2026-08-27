"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { apiGet } from "@/lib/api-client";

type Announcement = { id: string; type: string; message: string; createdAt: string; expiresAt: string | null };

/**
 * Platform-wide announcement banner, mounted once in the player app shell
 * so it's visible on every page — including for a player who never joined
 * a game room, and one who's already mid-session elsewhere in the app.
 * Fetches the current active list on mount (covers "just opened the app"),
 * then stays live via the shared /api/stream connection (covers "operator
 * announces while I'm already looking at my wallet"). Dismissals are
 * per-browser-session only (component state, not persisted) — the same
 * announcement reappears on a fresh visit, which is intentional: a player
 * who logs back in later should still see "Game starts in 5 minutes" if
 * it's still active.
 */
export function GlobalAnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    apiGet<{ announcements: Announcement[] }>("/api/announcements/active")
      .then((res) => {
        if (!cancelled) setAnnouncements(res.announcements);
      })
      .catch(() => {
        /* the banner just stays empty until the next live event — not worth surfacing an error here */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("game:announcement", (e) => {
      const data = JSON.parse(e.data) as Announcement;
      setAnnouncements((prev) => [data, ...prev.filter((a) => a.id !== data.id)].slice(0, 5));
    });
    return () => es.close();
  }, []);

  const visible = announcements.filter((a) => !dismissed.has(a.id) && (!a.expiresAt || new Date(a.expiresAt) > new Date()));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-1.5 px-4 pt-3 sm:px-6">
      {visible.map((a) => (
        <div
          key={a.id}
          className={
            a.type === "WARNING" || a.type === "IMPORTANT"
              ? "flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
              : "flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-800"
          }
        >
          <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{a.message}</span>
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
