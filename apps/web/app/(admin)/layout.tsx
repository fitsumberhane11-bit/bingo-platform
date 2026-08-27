import { redirect } from "next/navigation";
import { PERMISSIONS } from "@bingo/shared-types";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { BrandMark } from "@/components/BrandMark";
import { AdminNav, type AdminNavVisibility } from "@/components/layout/AdminNav";
import { TestMoneyBanner } from "@/components/layout/TestMoneyBanner";
import { MaintenanceBanner } from "@/components/layout/MaintenanceBanner";
import { SessionKeepAlive } from "@/components/layout/SessionKeepAlive";

/**
 * Admin shell — games, payments, withdrawals, finance, and user management.
 * Downloadable reports and a dedicated settings UI are still open work.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await loadAccessContext(current.sub);
  if (!ctx.isSuperAdmin && ctx.roles.length === 0) redirect("/dashboard");
  if (!ctx.isSuperAdmin && ctx.roles.every((r) => r === "PLAYER")) redirect("/dashboard");

  // Only surface nav links this account can actually use — an operator
  // clicking into Users/Payments/Withdrawals/Finance/Settings would just
  // hit a permission-denied page, so there's no reason to show them.
  const visibility: AdminNavVisibility = {
    games: hasPermission(ctx, PERMISSIONS.GAME_VIEW),
    createGame: hasPermission(ctx, PERMISSIONS.GAME_CREATE),
    users: hasPermission(ctx, PERMISSIONS.USER_VIEW),
    payments: hasPermission(ctx, PERMISSIONS.PAYMENT_VIEW),
    withdrawals: hasPermission(ctx, PERMISSIONS.WITHDRAWAL_VIEW),
    finance: hasPermission(ctx, PERMISSIONS.REPORTS_VIEW),
    settings: hasPermission(ctx, PERMISSIONS.SETTINGS_MANAGE),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SessionKeepAlive />
      <TestMoneyBanner />
      <MaintenanceBanner />
      <header className="relative border-b border-slate-200 bg-ink-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <BrandMark size="sm" />
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-200">
              Admin
            </span>
          </div>
          <AdminNav visibility={visibility} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
