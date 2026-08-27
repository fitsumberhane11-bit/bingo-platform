"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, X } from "lucide-react";
import clsx from "clsx";
import { LogoutButton } from "./LogoutButton";

export interface AdminNavVisibility {
  games: boolean;
  createGame: boolean;
  users: boolean;
  payments: boolean;
  withdrawals: boolean;
  finance: boolean;
  settings: boolean;
}

const ALL_LINKS: { href: string; label: string; key: keyof AdminNavVisibility | null }[] = [
  { href: "/admin", label: "Dashboard", key: null },
  { href: "/admin/games", label: "Games", key: "games" },
  { href: "/admin/users", label: "Users", key: "users" },
  { href: "/admin/payments", label: "Payments", key: "payments" },
  { href: "/admin/withdrawals", label: "Withdrawals", key: "withdrawals" },
  { href: "/admin/finance", label: "Finance", key: "finance" },
  { href: "/admin/settings", label: "Settings", key: "settings" },
];

export function AdminNav({ visibility }: { visibility: AdminNavVisibility }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const LINKS = ALL_LINKS.filter((l) => l.key === null || visibility[l.key]);

  return (
    <>
      <nav className="hidden items-center gap-4 text-sm lg:flex">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={clsx("text-slate-200 hover:text-white", pathname === l.href && "font-semibold text-white")}
          >
            {l.label}
          </Link>
        ))}
        {visibility.createGame && (
          <Link href="/admin/games/new" className="flex items-center gap-1 font-semibold text-brand-300 hover:text-brand-200">
            <Plus className="h-3.5 w-3.5" /> Create game
          </Link>
        )}
        <LogoutButton className="text-slate-200 hover:text-white" />
      </nav>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close admin menu" : "Open admin menu"}
        aria-expanded={open}
        className="rounded-lg p-2 text-slate-200 hover:bg-white/10 hover:text-white lg:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 border-b border-slate-800 bg-ink-900 px-4 py-3 shadow-lg lg:hidden">
          <nav className="flex flex-col gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "rounded-lg px-3 py-2.5 text-slate-200 hover:bg-white/10 hover:text-white",
                  pathname === l.href && "bg-white/10 font-semibold text-white",
                )}
              >
                {l.label}
              </Link>
            ))}
            {visibility.createGame && (
              <Link
                href="/admin/games/new"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 font-semibold text-brand-300 hover:bg-white/10 hover:text-brand-200"
              >
                <Plus className="h-4 w-4" /> Create game
              </Link>
            )}
            <div className="mt-1 border-t border-slate-800 pt-2">
              <LogoutButton className="w-full rounded-lg px-3 py-2.5 text-left text-slate-200 hover:bg-white/10 hover:text-white" />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
