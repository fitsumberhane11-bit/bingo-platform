"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const TYPES = [
  { value: "", label: "All types" },
  { value: "DEPOSIT", label: "Deposit" },
  { value: "TICKET_PURCHASE", label: "Ticket purchase" },
  { value: "WINNING_PAYOUT", label: "Prize" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
  { value: "REFUND", label: "Refund" },
  { value: "ADJUSTMENT", label: "Adjustment" },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "REVERSED", label: "Reversed" },
];

export function TransactionFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        className="input w-auto"
        aria-label="Filter by transaction type"
        value={searchParams.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        className="input w-auto"
        aria-label="Filter by status"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
