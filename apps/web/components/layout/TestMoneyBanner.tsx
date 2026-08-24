import { getEnv } from "@/lib/env";

/**
 * Server-rendered, server-decided — the banner's presence is driven by
 * `getEnv().GAME_MONEY_MODE`, read fresh on every request from the same
 * validated environment config that gates real-money code paths
 * elsewhere (see lib/env.ts). There's no client-side flag to misconfigure
 * or a build-time constant that could go stale: if the server is in TEST
 * mode, this banner renders; if a deployment is ever misconfigured to
 * REAL without actually being production-ready, that's a server-side
 * decision this component has no ability to override or hide.
 */
export function TestMoneyBanner() {
  const { GAME_MONEY_MODE } = getEnv();
  if (GAME_MONEY_MODE !== "TEST") return null;

  return (
    <div className="bg-amber-400 px-4 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-amber-950">
      Demo Mode — No Real Money
    </div>
  );
}
