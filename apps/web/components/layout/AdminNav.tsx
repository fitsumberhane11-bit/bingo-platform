"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { LogoutButton } from "./LogoutButton";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
        <Link href="/dashboard" className="text-slate-200 hover:text-white">
          Player view
        </Link>
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
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              Player view
            </Link>
            <div className="mt-1 border-t border-slate-800 pt-2">
              <LogoutButton className="w-full rounded-lg px-3 py-2.5 text-left text-slate-200 hover:bg-white/10 hover:text-white" />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
