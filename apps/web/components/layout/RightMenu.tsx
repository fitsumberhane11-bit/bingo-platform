"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, History, Sun, Moon } from "lucide-react";
import { getStoredTheme, applyTheme, type Theme } from "@/lib/theme";

// Secondary, on-demand items that shouldn't compete with the primary left
// nav / bottom nav for space — right now that's game history (a page the
// player checks occasionally, not every session) and the appearance
// preference. Opens as a slide-in panel from the right edge.
export function RightMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function setThemeAndPersist(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink-900"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-slate-200 bg-white p-4 shadow-xl dark:bg-ink-800">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900">Menu</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Link
              href="/games/history"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <History className="h-4 w-4" />
              Game history
            </Link>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Appearance</p>
              <div className="flex gap-2 px-3">
                <button
                  type="button"
                  onClick={() => setThemeAndPersist("light")}
                  aria-pressed={theme === "light"}
                  className={
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors " +
                    (theme === "light"
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50")
                  }
                >
                  <Sun className="h-3.5 w-3.5" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setThemeAndPersist("dark")}
                  aria-pressed={theme === "dark"}
                  className={
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors " +
                    (theme === "dark"
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50")
                  }
                >
                  <Moon className="h-3.5 w-3.5" />
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
