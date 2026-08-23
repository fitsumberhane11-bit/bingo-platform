import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getEffectiveLimits } from "@/lib/responsible-gaming-service";
import { ResponsibleGamingPanel } from "./ResponsibleGamingPanel";

export const metadata = { title: "Responsible Gaming" };

export default async function ResponsibleGamingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const limits = await getEffectiveLimits(current.sub);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Responsible Gaming</h1>
        <p className="text-sm text-slate-500">
          Set your own limits, take a break, or exclude yourself entirely. These controls are enforced by our servers, not just this page.
        </p>
      </div>

      <ResponsibleGamingPanel
        initialLimits={{
          dailyDepositLimit: limits.dailyDepositLimit?.toString() ?? null,
          weeklyDepositLimit: limits.weeklyDepositLimit?.toString() ?? null,
          dailySpendLimit: limits.dailySpendLimit?.toString() ?? null,
          weeklySpendLimit: limits.weeklySpendLimit?.toString() ?? null,
          pendingIncreaseEffectiveAt: limits.pendingIncreaseEffectiveAt?.toISOString() ?? null,
          coolingOffUntil: limits.coolingOffUntil?.toISOString() ?? null,
          selfExcludedUntil: limits.selfExcludedUntil?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
