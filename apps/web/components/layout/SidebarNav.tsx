"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_ITEMS, type NavItem } from "./nav-items";

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} active={pathname?.startsWith(item.href) ?? false} />
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.primary || ["/wallet/deposit", "/tickets", "/profile"].includes(i.href)).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white py-1.5 lg:hidden">
      {items.map((item) => (
        <MobileNavLink key={item.href} item={item} active={pathname?.startsWith(item.href) ?? false} />
      ))}
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  if (!item.enabled) {
    return (
      <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-300">
        <span className="flex items-center gap-2.5">
          <Icon className="h-4 w-4" />
          {item.label}
        </span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Soon</span>
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <span className={clsx("flex flex-col items-center gap-0.5 px-2 py-1.5 text-[11px]", active ? "text-brand-700" : "text-slate-500")}>
      <Icon className="h-5 w-5" />
      {item.label}
    </span>
  );
  if (!item.enabled) {
    return <span className="opacity-40">{content}</span>;
  }
  return <Link href={item.href}>{content}</Link>;
}
