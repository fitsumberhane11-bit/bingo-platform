"use client";

import { useEffect } from "react";

// The access token cookie lives for AUTH_JWT_ACCESS_TTL_SECONDS (15 minutes
// by default) but the refresh token lives for 30 days — the whole point of
// that split is that a session shouldn't die out from under an active user
// just because 15 minutes passed. Nothing was actually calling
// /api/auth/refresh before this existed, so every session — mid-game,
// mid-form, anywhere — hard-logged-out on a fixed 15-minute clock
// regardless of activity. This silently rotates the session tokens well
// before the access token expires, for as long as the tab stays open.
const REFRESH_INTERVAL_MS = 8 * 60 * 1000;

export function SessionKeepAlive() {
  useEffect(() => {
    const refresh = () => {
      fetch("/api/auth/refresh", { method: "POST" }).catch(() => {
        // A failed refresh here just means the next real navigation will
        // hit the normal expired-session redirect — no special handling
        // needed for a background keep-alive ping.
      });
    };
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
