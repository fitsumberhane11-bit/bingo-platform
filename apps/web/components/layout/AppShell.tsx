import { Wallet as WalletIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav, BottomNav } from "./SidebarNav";
import { TestMoneyBanner } from "./TestMoneyBanner";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { SessionKeepAlive } from "./SessionKeepAlive";

interface AppShellProps {
  children: React.ReactNode;
  user: { fullName: string; username: string };
  walletBalance: string;
}

export async function AppShell({ children, user, walletBalance }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <SessionKeepAlive />
      <TestMoneyBanner />
      <MaintenanceBanner />
      <div className="lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-100 px-5 py-4">
          <BrandMark />
        </div>
        <SidebarNav />
        <div className="border-t border-slate-100 p-3">
          <LogoutButton className="btn-ghost w-full justify-start" />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:justify-end">
          <div className="lg:hidden">
            <BrandMark size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
              <WalletIcon className="h-3.5 w-3.5" />
              ETB {walletBalance}
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">@{user.username}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-8">{children}</main>
      </div>
      </div>

      <BottomNav />
    </div>
  );
}
