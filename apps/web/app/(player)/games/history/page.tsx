import Link from "next/link";
import { History } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { getPlayerGameHistory } from "@/lib/game/queries";
import { prisma } from "@bingo/db";

export const metadata = { title: "My Games" };

interface SearchParams {
  page?: string;
  status?: string;
  search?: string;
  winningPatternId?: string;
  wonOnly?: string;
}

export default async function GameHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const current = await getCurrentUser();
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const status = searchParams.status === "COMPLETED" || searchParams.status === "CANCELLED" ? searchParams.status : undefined;
  const wonOnly = searchParams.wonOnly === "true";

  const [{ games, total }, patterns] = await Promise.all([
    getPlayerGameHistory(current!.sub, page, 10, {
      status,
      search: searchParams.search?.trim() || undefined,
      winningPatternId: searchParams.winningPatternId || undefined,
      wonOnly,
    }),
    prisma.winningPattern.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 10));

  // Preserves the current filters when building pagination links.
  const filterQuery = new URLSearchParams();
  if (status) filterQuery.set("status", status);
  if (searchParams.search) filterQuery.set("search", searchParams.search);
  if (searchParams.winningPatternId) filterQuery.set("winningPatternId", searchParams.winningPatternId);
  if (wonOnly) filterQuery.set("wonOnly", "true");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">My Games</h1>
        <p className="text-sm text-slate-500">Games you&apos;ve played, past and cancelled.</p>
      </div>

      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <input type="text" name="search" placeholder="Game name" aria-label="Search by game name" defaultValue={searchParams.search} className="input" />
        <select name="status" aria-label="Filter by status" defaultValue={status ?? ""} className="input">
          <option value="">Any status</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select name="winningPatternId" aria-label="Filter by winning pattern" defaultValue={searchParams.winningPatternId ?? ""} className="input">
          <option value="">Any pattern</option>
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="wonOnly" value="true" defaultChecked={wonOnly} />
          Games I won
        </label>
        <button type="submit" className="btn-primary sm:col-span-2 lg:col-span-4">
          Apply filters
        </button>
      </form>

      {games.length === 0 ? (
        <div className="card py-12 text-center text-slate-400">
          <History className="mx-auto mb-2 h-8 w-8" />
          <p>No games match these filters.</p>
          <Link href="/play" className="btn-primary mt-4 inline-flex">
            Find a game
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {games.map((g) => (
            <Link key={g.id} href={`/room/${g.id}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-slate-50">
              <div>
                <p className="font-semibold text-ink-900">{g.name}</p>
                <p className="text-xs text-slate-400">
                  {g.completedAt ? new Date(g.completedAt).toLocaleString() : "—"} · {g.winningPattern.name} · {g._count.winners} winner
                  {g._count.winners === 1 ? "" : "s"}
                  {g.winners[0] && <span className="font-semibold text-gold-600"> · You won ETB {g.winners[0].prizeAmount.toString()}</span>}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${g.status === "COMPLETED" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                {g.status}
              </span>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/games/history?${new URLSearchParams({ ...Object.fromEntries(filterQuery), page: String(p) }).toString()}`}
              className={`rounded-lg px-3 py-1.5 font-medium ${p === page ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
