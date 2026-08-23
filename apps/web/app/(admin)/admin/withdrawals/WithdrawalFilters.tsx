"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

const STATUSES = ["", "REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "CANCELLED"];
const PROVIDERS = ["", "TELEBIRR", "CBE"];

export function WithdrawalFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [minAmount, setMinAmount] = useState(searchParams.get("minAmount") ?? "");
  const [maxAmount, setMaxAmount] = useState(searchParams.get("maxAmount") ?? "");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="input w-auto"
        aria-label="Filter by status"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s || "All statuses"}
          </option>
        ))}
      </select>
      <select
        className="input w-auto"
        aria-label="Filter by method"
        value={searchParams.get("provider") ?? ""}
        onChange={(e) => setParam("provider", e.target.value)}
      >
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {p || "All methods"}
          </option>
        ))}
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("minAmount", minAmount);
          setParam("maxAmount", maxAmount);
        }}
        className="flex items-center gap-2"
      >
        <input className="input w-24" placeholder="Min ETB" aria-label="Minimum amount (ETB)" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        <input className="input w-24" placeholder="Max ETB" aria-label="Maximum amount (ETB)" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>
    </div>
  );
}
