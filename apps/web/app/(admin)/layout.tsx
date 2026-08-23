import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { loadAccessContext } from "@/lib/rbac-server";
import { BrandMark } from "@/components/BrandMark";
import { AdminNav } from "@/components/layout/AdminNav";
import { TestMoneyBanner } from "@/components/layout/TestMoneyBanner";
import { MaintenanceBanner } from "@/components/layout/MaintenanceBanner";

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

  return (
    <div className="min-h-screen bg-slate-50">
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
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
