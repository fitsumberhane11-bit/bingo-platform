"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

const STATUSES = ["", "INITIATED", "PENDING", "PENDING_RECONCILIATION", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED", "REVERSED"];
const PROVIDERS = ["", "MOCK", "TELEBIRR", "CBE", "CHAPA", "ARIFPAY", "MPESA"];

export function PaymentFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(searchParams.get("user") ?? "");

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
        aria-label="Filter by provider"
        value={searchParams.get("provider") ?? ""}
        onChange={(e) => setParam("provider", e.target.value)}
      >
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {p || "All providers"}
          </option>
        ))}
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("user", user);
        }}
        className="flex gap-2"
      >
        <input
          className="input w-auto"
          placeholder="Search username…"
          aria-label="Search by username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>
    </div>
  );
}
