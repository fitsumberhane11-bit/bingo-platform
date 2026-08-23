import Link from "next/link";
import { prisma } from "@bingo/db";
import { ArrowDownToLine, ArrowUpFromLine, Receipt, Wallet as WalletIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { formatETB, formatEthiopianDateTime } from "@/lib/format";

export const metadata = { title: "Wallet" };

const SUM_TYPES = ["DEPOSIT", "WITHDRAWAL", "WINNING_PAYOUT", "TICKET_PURCHASE"] as const;

export default async function WalletPage() {
  const current = await getCurrentUser();
  const userId = current!.sub;

  const [wallet, sums, recent] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { availableBalance: true, pendingBalance: true, currency: true } }),
    prisma.walletTransaction.groupBy({
      by: ["type"],
      where: { userId, status: "COMPLETED", type: { in: [...SUM_TYPES] } },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const totals = Object.fromEntries(SUM_TYPES.map((t) => [t, "0"])) as Record<(typeof SUM_TYPES)[number], string>;
  for (const row of sums) {
    totals[row.type as (typeof SUM_TYPES)[number]] = (row._sum.amount ?? 0).toString();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Wallet</h1>
        <p className="text-sm text-slate-500">Your balance, deposits, withdrawals, and winnings — all in one place.</p>
      </div>

      <div className="card flex flex-col gap-4 bg-brand-600 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-brand-100">Available balance</p>
          <p className="text-3xl font-bold">{formatETB(wallet?.availableBalance ?? 0)}</p>
          {Number(wallet?.pendingBalance ?? 0) > 0 && (
            <p className="mt-1 text-xs text-brand-100">
              + {formatETB(wallet?.pendingBalance ?? 0)} pending (reserved for withdrawal review)
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/wallet/deposit" className="btn-secondary inline-flex items-center gap-1.5 !bg-white !text-brand-700">
            <ArrowDownToLine className="h-4 w-4" /> Deposit
          </Link>
          <Link href="/wallet/withdraw" className="btn-secondary inline-flex items-center gap-1.5 !border-white/40 !bg-transparent !text-white hover:!bg-white/10">
            <ArrowUpFromLine className="h-4 w-4" /> Withdraw
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total deposited" value={formatETB(totals.DEPOSIT)} />
        <StatCard label="Total withdrawn" value={formatETB(totals.WITHDRAWAL)} />
        <StatCard label="Total winnings" value={formatETB(totals.WINNING_PAYOUT)} />
        <StatCard label="Spent on tickets" value={formatETB(totals.TICKET_PURCHASE)} />
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">Recent activity</h2>
          <Link href="/transactions" className="text-sm font-medium text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <Receipt className="mx-auto mb-2 h-7 w-7" />
            <p className="text-sm">No transactions yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{formatType(t.type)}</p>
                  <p className="text-xs text-slate-400">{formatEthiopianDateTime(t.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink-900">{formatETB(t.amount)}</p>
                  <p className="text-xs text-slate-400">{t.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <WalletIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-400">{label}</p>
        <p className="truncate text-sm font-bold text-ink-900">{value}</p>
      </div>
    </div>
  );
}

function formatType(type: string): string {
  return type
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}
