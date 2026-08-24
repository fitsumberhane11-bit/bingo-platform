"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Wallet as WalletIcon } from "lucide-react";
import { apiGet } from "@/lib/api-client";

/**
 * The layout that renders this only re-executes on a full navigation, not
 * on client-side Link/router.push navigation within the same route group —
 * so a server-computed balance prop alone goes stale the moment a user
 * deposits or wins and then clicks anywhere without a hard reload. Refetch
 * on every pathname change to keep the header honest.
 */
export function HeaderWalletBalance({ initialBalance }: { initialBalance: string }) {
  const [balance, setBalance] = useState(initialBalance);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    apiGet<{ wallet: { availableBalance: string } | null }>("/api/wallet")
      .then((res) => {
        if (!cancelled && res.wallet) setBalance(res.wallet.availableBalance);
      })
      .catch(() => {
        /* header balance is a convenience display, not gating any action — fail silently */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
      <WalletIcon className="h-3.5 w-3.5" />
      ETB {balance}
    </div>
  );
}
