"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drops into any server-rendered page that lists live game state (the
 * lobby, the dashboard) and re-runs that page's server component the
 * moment a relevant event arrives over the shared /api/stream connection —
 * this is what makes a game opening for registration (or any other status
 * change) show up for a player who's just sitting on /play, without them
 * having to refresh. `router.refresh()` re-fetches from the server but
 * preserves client state (scroll position, open menus), unlike a full
 * reload.
 */
export function LiveRefresh({ events }: { events: string[] }) {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/stream");
    const onEvent = () => router.refresh();
    for (const type of events) es.addEventListener(type, onEvent);
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join(",")]);

  return null;
}
