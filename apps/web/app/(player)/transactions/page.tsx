import { Suspense } from "react";
import Link from "next/link";
import { prisma, type Prisma, type WalletTxType, type WalletTxStatus } from "@bingo/db";
import { Receipt, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { TransactionFilters } from "./TransactionFilters";

export const metadata = { title: "Transactions" };

const CREDIT_TYPES = new Set(["DEPOSIT", "WINNING_PAYOUT", "REFUND", "PROMO_CREDIT"]);
const PAGE_SIZE = 20;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string; page?: string };
}) {
  const current = await getCurrentUser();
  const page = Math.max(1, Number(searchParams.page ?? "1"));

  const where: Prisma.WalletTransactionWhereInput = {
    userId: current!.sub,
    ...(searchParams.type ? { type: searchParams.type as WalletTxType } : {}),
    ...(searchParams.status ? { status: searchParams.status as WalletTxStatus } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.walletTransaction.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Transactions</h1>
        <p className="text-sm text-slate-500">Every deposit, purchase, and payout — permanently recorded.</p>
      </div>

      <Suspense>
        <TransactionFilters />
      </Suspense>

      <div className="card">
        {transactions.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Receipt className="mx-auto mb-2 h-8 w-8" />
            <p className="text-sm">No transactions match these filters yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {transactions.map((t) => {
              const isCredit = CREDIT_TYPES.has(t.type);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                        isCredit ? "bg-brand-50 text-brand-600" : "bg-red-50 text-red-600"
                      }`}
                    >
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{formatType(t.type)}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(t.createdAt).toLocaleString()}
                        {t.provider ? ` · ${t.provider}` : ""}
                      </p>
                      <p className="font-mono text-[10px] text-slate-300">{t.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${isCredit ? "text-brand-700" : "text-red-600"}`}>
                      {isCredit ? "+" : "-"}ETB {t.amount.toString()}
                    </p>
                    <p className="text-xs text-slate-400">{t.status}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <PageLink key={p} page={p} active={p === page} searchParams={searchParams} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  active,
  searchParams,
}: {
  page: number;
  active: boolean;
  searchParams: { type?: string; status?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.type) params.set("type", searchParams.type);
  if (searchParams.status) params.set("status", searchParams.status);
  params.set("page", String(page));
  return (
    <Link
      href={`/transactions?${params.toString()}`}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 font-medium ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {page}
    </Link>
  );
}

function formatType(type: string): string {
  return type
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}
