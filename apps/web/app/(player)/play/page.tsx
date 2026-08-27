import Link from "next/link";
import { Users, Trophy, Clock, Percent } from "lucide-react";
import { listLobbyGames, listRecentCompletedGames } from "@/lib/game/queries";
import { formatETB, formatEthiopianDateTime, formatEthiopianDate } from "@/lib/format";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export const metadata = { title: "Play Bingo" };

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  OPEN: "Open for tickets",
  FULL: "Full",
  STARTING: "Starting soon",
  LIVE: "Live now",
};

export default async function LobbyPage() {
  const [{ live, upcoming }, completed] = await Promise.all([listLobbyGames(), listRecentCompletedGames()]);

  return (
    <div className="space-y-8">
      <LiveRefresh events={["game:lobby-update"]} />
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Play Bingo</h1>
        <p className="text-sm text-slate-500">Choose a game and grab your tickets.</p>
      </div>

      <LobbySection title="Live Now" emptyMessage="No games are live right now.">
        {live.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </LobbySection>

      <LobbySection title="Upcoming" emptyMessage="No upcoming games scheduled yet. Check back soon!">
        {upcoming.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </LobbySection>

      <LobbySection title="Recently Completed" emptyMessage="No completed games yet.">
        {completed.map((g) => (
          <div key={g.id} className="card flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Completed</span>
              <span className="text-xs text-slate-400">{g.winningPattern.name}</span>
            </div>
            <h2 className="mb-1 font-semibold text-ink-900">{g.name}</h2>
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Clock className="h-3.5 w-3.5" /> {g.completedAt ? formatEthiopianDate(g.completedAt) : "—"}
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Users className="h-3.5 w-3.5" /> {g._count.players} players
              </div>
              {g.winners[0] && (
                <div className="col-span-2 flex items-center gap-1.5 font-semibold text-gold-600">
                  <Trophy className="h-3.5 w-3.5" /> {formatETB(g.winners[0].prizeAmount)} won ({g._count.winners} winner{g._count.winners === 1 ? "" : "s"})
                </div>
              )}
            </dl>
            <Link href={`/room/${g.id}`} className="btn-secondary mt-auto">
              View result
            </Link>
          </div>
        ))}
      </LobbySection>
    </div>
  );
}

function LobbySection({ title, emptyMessage, children }: { title: string; emptyMessage: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-ink-900">{title}</h2>
      {!hasChildren ? (
        <div className="card py-8 text-center text-sm text-slate-400">{emptyMessage}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

interface LobbyGame {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startTime: Date;
  registrationCloseAt: Date;
  ticketPrice: { toString(): string };
  maxPlayers: number;
  jackpotAmount: { toString(): string };
  prizePool: string;
  prizePercent: string | null;
  ticketsSold: number;
  winningPattern: { name: string };
  _count: { players: number };
}

function GameCard({ game: g }: { game: LobbyGame }) {
  const isLive = g.status === "LIVE" || g.status === "STARTING";
  // Deliberately not gated on registrationCloseAt — see the comment on the
  // matching check removed from lib/game/tickets.ts: that's a scheduling
  // default from creation time, not a live signal, and treating it as a
  // hard cutoff meant a game the operator had genuinely opened for tickets
  // would silently flip to "View Game" hours later with nothing in the
  // control panel showing anything had changed. `status` (which only ever
  // changes via the operator's own explicit actions) is the real gate.
  const canBuyNow = g.status === "OPEN" || g.status === "FULL";
  return (
    <div className="card flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            isLive ? "bg-red-50 text-red-600" : g.status === "OPEN" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {isLive && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
          {STATUS_LABEL[g.status] ?? g.status}
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-400" title="Winning pattern">
          {g.winningPattern.name}
        </span>
      </div>

      <h3 className="mb-2 font-semibold text-ink-900">{g.name}</h3>

      <dl className="mb-4 grid grid-cols-2 gap-x-2 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-400">Ticket</dt>
          <dd className="font-semibold text-ink-900">{formatETB(g.ticketPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Players</dt>
          <dd className="flex items-center gap-1 font-medium text-ink-900">
            <Users className="h-3.5 w-3.5 text-slate-400" /> {g._count.players} / {g.maxPlayers}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Prize Pool</dt>
          <dd className="flex items-center gap-1 font-semibold text-gold-600">
            <Trophy className="h-3.5 w-3.5" /> {formatETB(g.prizePool)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Starts</dt>
          <dd className="flex items-center gap-1 text-slate-600">
            <Clock className="h-3.5 w-3.5 text-slate-400" /> {formatEthiopianDateTime(g.startTime)}
          </dd>
        </div>
        {g.prizePercent && (
          <div className="col-span-2 flex items-center gap-1 text-xs text-slate-400">
            <Percent className="h-3 w-3" /> {g.prizePercent}% of ticket sales go to the prize pool
          </div>
        )}
      </dl>

      <Link href={`/room/${g.id}`} className={canBuyNow || isLive ? "btn-primary mt-auto" : "btn-secondary mt-auto"}>
        {isLive ? "Join Game" : canBuyNow ? "Buy Ticket" : "View Game"}
      </Link>
    </div>
  );
}
