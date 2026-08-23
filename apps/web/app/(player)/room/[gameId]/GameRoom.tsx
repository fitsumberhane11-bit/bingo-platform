"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Trophy, Users, Wallet, ShieldCheck, Megaphone, Ticket as TicketIcon, Volume2, VolumeX, Vibrate, Wifi, WifiOff } from "lucide-react";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { playSound, unlockAudio, vibrate, getSoundSettings, setSoundSettings, subscribeSoundSettings, type SoundSettings } from "@/lib/sound";

type Card = { B: number[]; I: number[]; N: (number | null)[]; G: number[]; O: number[] };
type Ticket = { id: string; ticketNumber: number; cardNumbers: Card; status: string };
type CalledNumber = { ballNumber: number; letter: string; sequenceNumber: number };
type Announcement = { id: string; type: string; message: string; createdAt: string; expiresAt: string | null };
type WinnerEntry = { ticketId: string; ticketNumber: number; username: string; prizeAmount: string; ballNumberAtWin: number; isMine: boolean };

export interface GameSnapshot {
  serverTimestamp: string;
  game: {
    id: string;
    name: string;
    status: string;
    ticketPrice: string;
    maxPlayers: number;
    maxTicketsPerPlayer: number;
    jackpotAmount: string;
    callMode: string;
    manualMarkEnabled: boolean;
    seedCommitmentHash: string;
    winningPattern: { id: string; name: string; description: string | null };
  };
  currentNumber: CalledNumber | null;
  calledNumbers: CalledNumber[];
  calledCount: number;
  remainingCount: number;
  playerCount: number;
  ticketCount: number;
  prizePool: string;
  announcements: Announcement[];
  winners: WinnerEntry[];
  playerTickets: Ticket[];
}

const LETTERS = ["B", "I", "N", "G", "O"] as const;
const RANGES: Record<string, [number, number]> = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };

export function GameRoom({
  gameId,
  initialSnapshot,
  isAuthenticated,
}: {
  gameId: string;
  initialSnapshot: GameSnapshot;
  isAuthenticated: boolean;
}) {
  const [status, setStatus] = useState(initialSnapshot.game.status);
  const [calledNumbers, setCalledNumbers] = useState<CalledNumber[]>(initialSnapshot.calledNumbers);
  const [playerCount, setPlayerCount] = useState(initialSnapshot.playerCount);
  const [ticketCount, setTicketCount] = useState(initialSnapshot.ticketCount);
  const [prizePool, setPrizePool] = useState(initialSnapshot.prizePool);
  const [tickets, setTickets] = useState(initialSnapshot.playerTickets);
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialSnapshot.announcements);
  const [winners, setWinners] = useState<WinnerEntry[]>(initialSnapshot.winners);
  const [activeTicketIdx, setActiveTicketIdx] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [winnerBanner, setWinnerBanner] = useState<{ ticketNumber: number; prizeAmount: string; winnerCount: number; mine: boolean } | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyCount, setBuyCount] = useState(1);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [soundSettings, setSoundSettingsState] = useState<SoundSettings>(() => getSoundSettings());

  useEffect(() => subscribeSoundSettings(setSoundSettingsState), []);

  async function refreshWallet() {
    if (!isAuthenticated) return;
    try {
      const res = await apiGet<{ wallet: { availableBalance: string } | null }>("/api/wallet");
      if (res.wallet) setWalletBalance(res.wallet.availableBalance);
    } catch {
      /* wallet balance is a convenience display here, not gating any action — fail silently */
    }
  }

  useEffect(() => {
    refreshWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const calledSet = useMemo(() => new Set(calledNumbers.map((c) => c.ballNumber)), [calledNumbers]);
  const currentNumber = calledNumbers[calledNumbers.length - 1];
  const myTicketIds = useRef(new Set(initialSnapshot.playerTickets.map((t) => t.id)));

  useEffect(() => {
    const es = new EventSource(`/api/games/${gameId}/stream`);

    es.onopen = () => setConnectionState("live");
    es.onerror = () => setConnectionState("reconnecting"); // native EventSource auto-reconnects; game:sync on the next open repairs any gap

    // `game:sync` carries the FULL authoritative GameSnapshot — sent once on
    // first connect and again automatically every time the browser
    // reconnects (network drop, tab wake from sleep, etc). Reapplying it
    // wholesale means a client that missed events while disconnected still
    // ends up in the exact correct state, with no page reload required.
    es.addEventListener("game:sync", (e) => {
      const data: GameSnapshot = JSON.parse(e.data);
      setStatus(data.game.status);
      setCalledNumbers(data.calledNumbers);
      setPlayerCount(data.playerCount);
      setTicketCount(data.ticketCount);
      setPrizePool(data.prizePool);
      setAnnouncements(data.announcements);
      setWinners(data.winners);
      if (data.playerTickets.length > 0) {
        setTickets(data.playerTickets);
        for (const t of data.playerTickets) myTicketIds.current.add(t.id);
      }
    });
    es.addEventListener("game:status", (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status);
      if (data.status !== "STARTING") setCountdown(null);
      if (data.status === "LIVE") playSound("gameStart");
    });
    es.addEventListener("game:countdown", (e) => {
      const data = JSON.parse(e.data);
      setCountdown(data.seconds);
      playSound("countdownTick");
    });
    es.addEventListener("game:number-called", (e) => {
      const data = JSON.parse(e.data);
      setCalledNumbers((prev) => [...prev, data]);
      playSound("numberCalled");
    });
    es.addEventListener("game:player-count", (e) => {
      const data = JSON.parse(e.data);
      setPlayerCount(data.count);
    });
    es.addEventListener("game:ticket-purchased", (e) => {
      const data = JSON.parse(e.data);
      if (typeof data.prizePool === "string") setPrizePool(data.prizePool);
      setTicketCount((prev) => prev + (typeof data.ticketCount === "number" ? data.ticketCount : 1));
    });
    es.addEventListener("game:announcement", (e) => {
      const data: Announcement = JSON.parse(e.data);
      setAnnouncements((prev) => [data, ...prev].slice(0, 20));
      playSound("announcement");
    });
    es.addEventListener("game:winner", (e) => {
      const data = JSON.parse(e.data);
      const mine = myTicketIds.current.has(data.ticketId);
      setWinnerBanner({
        ticketNumber: data.ticketNumber,
        prizeAmount: data.prizeAmount,
        winnerCount: data.winnerCount,
        mine,
      });
      setWinners((prev) => [
        ...prev,
        {
          ticketId: data.ticketId,
          ticketNumber: data.ticketNumber,
          username: "",
          prizeAmount: data.prizeAmount,
          ballNumberAtWin: 0, // not shown in the results UI — the live game:winner event doesn't carry it
          isMine: mine,
        },
      ]);
      playSound("winner");
      if (mine) {
        vibrate([80, 40, 80, 40, 160]);
        refreshWallet(); // the payout has already landed server-side by the time this event fires
      }
    });
    es.addEventListener("game:completed", () => {
      setStatus("COMPLETED");
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleBuyTickets() {
    unlockAudio();
    setBuying(true);
    setBuyError(null);
    try {
      const res = await apiPost<{ tickets: Ticket[] }>("/api/tickets/purchase", { gameId, ticketCount: buyCount });
      setTickets((prev) => [...prev, ...res.tickets]);
      for (const t of res.tickets) myTicketIds.current.add(t.id);
      playSound("ticketPurchase");
      refreshWallet();
    } catch (err) {
      setBuyError(err instanceof ApiClientError ? err.message : "Purchase failed.");
      playSound("error");
    } finally {
      setBuying(false);
    }
  }

  const canBuy = status === "OPEN" || status === "FULL";
  const activeTicket = tickets[activeTicketIdx];
  const activeAnnouncements = announcements.filter((a) => !a.expiresAt || new Date(a.expiresAt) > new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-6">
      {/* Header */}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink-900">{initialSnapshot.game.name}</h1>
          <p className="text-xs text-slate-500">
            {initialSnapshot.game.winningPattern.name} · {initialSnapshot.game.callMode === "AUTO" ? "Auto-calling" : "Operator-controlled calling"}
            {initialSnapshot.game.manualMarkEnabled ? " · Manual mark" : " · Auto mark"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusPill status={status} />
          <ConnectionIndicator state={connectionState} />
          <span className="flex items-center gap-1 text-slate-500" title="Players in this game">
            <Users className="h-4 w-4" /> {playerCount}/{initialSnapshot.game.maxPlayers}
          </span>
          <span className="flex items-center gap-1 text-slate-500" title="Tickets sold">
            <TicketIcon className="h-4 w-4" /> {ticketCount}
          </span>
          <span className="flex items-center gap-1 font-semibold text-gold-600">
            <Trophy className="h-4 w-4" /> ETB {prizePool}
          </span>
          {isAuthenticated && (
            <Link href="/wallet" className="flex items-center gap-1 font-semibold text-brand-700" title="Your wallet balance">
              <Wallet className="h-4 w-4" /> {walletBalance !== null ? `ETB ${walletBalance}` : "…"}
            </Link>
          )}
          <SoundQuickToggle settings={soundSettings} />
        </div>
      </div>

      {activeAnnouncements.length > 0 && (
        <div className="space-y-2">
          {activeAnnouncements.slice(0, 3).map((a) => (
            <div
              key={a.id}
              className={clsx(
                "card flex items-start gap-2 py-3",
                a.type === "IMPORTANT" || a.type === "WARNING" ? "border-amber-300 bg-amber-50" : "bg-brand-50",
              )}
            >
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p className="text-sm text-ink-800">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {countdown !== null && countdown > 0 && (
        <div className="card bg-ink-900 text-center text-white">
          <p className="text-xs uppercase tracking-wide text-slate-300">Game starts in</p>
          <p className="font-mono text-4xl font-black tabular-nums">{String(countdown).padStart(2, "0")}s</p>
        </div>
      )}

      {winnerBanner && (
        <div className={clsx("card text-center", winnerBanner.mine ? "bg-gold-500 text-ink-900" : "bg-brand-50")}>
          <p className="text-lg font-extrabold">🎉 BINGO! 🎉</p>
          <p className="text-sm">
            {winnerBanner.mine ? "You won!" : `Ticket #${winnerBanner.ticketNumber} won`} — ETB {winnerBanner.prizeAmount}
            {winnerBanner.winnerCount > 1 && ` (split ${winnerBanner.winnerCount} ways)`}
          </p>
        </div>
      )}

      {status === "COMPLETED" && <ResultsScreen gameId={gameId} winners={winners} prizePool={prizePool} calledCount={calledNumbers.length} />}

      {/* Current number */}
      <div className="card flex flex-col items-center justify-center py-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Current number</p>
        {currentNumber ? (
          <div key={currentNumber.sequenceNumber} className="animate-ball-pop text-center">
            <p className="text-2xl font-black text-brand-600">{currentNumber.letter}</p>
            <p className="font-mono text-7xl font-black text-ink-900">{currentNumber.ballNumber}</p>
          </div>
        ) : (
          <p className="text-lg text-slate-300">Waiting for the game to start…</p>
        )}
        <p className="mt-3 text-xs text-slate-400">{calledNumbers.length} of 75 called</p>
      </div>

      {/* Called history */}
      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent calls</p>
        <div className="flex flex-wrap gap-1.5">
          {[...calledNumbers]
            .slice(-15)
            .reverse()
            .map((c) => (
              <span key={c.sequenceNumber} className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-900">
                {c.letter}-{c.ballNumber}
              </span>
            ))}
          {calledNumbers.length === 0 && <span className="text-xs text-slate-300">No numbers called yet.</span>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BingoBoard calledSet={calledSet} />

        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">My card</p>
          {tickets.length === 0 ? (
            <BuyTicketPanel
              canBuy={canBuy}
              status={status}
              isAuthenticated={isAuthenticated}
              ticketPrice={initialSnapshot.game.ticketPrice}
              maxTicketsPerPlayer={initialSnapshot.game.maxTicketsPerPlayer}
              buyCount={buyCount}
              setBuyCount={setBuyCount}
              buying={buying}
              buyError={buyError}
              onBuy={handleBuyTickets}
            />
          ) : (
            <div>
              {tickets.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {tickets.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTicketIdx(i)}
                      className={clsx(
                        "rounded-lg px-2.5 py-1 text-xs font-semibold",
                        i === activeTicketIdx ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      Ticket {t.ticketNumber}
                    </button>
                  ))}
                </div>
              )}
              {activeTicket && (
                <PlayerCard
                  key={activeTicket.id}
                  card={activeTicket.cardNumbers}
                  calledSet={calledSet}
                  won={activeTicket.status === "WINNER"}
                  manualMark={initialSnapshot.game.manualMarkEnabled}
                />
              )}
              {canBuy && tickets.length < initialSnapshot.game.maxTicketsPerPlayer && (
                <BuyTicketPanel
                  canBuy={canBuy}
                  status={status}
                  isAuthenticated={isAuthenticated}
                  ticketPrice={initialSnapshot.game.ticketPrice}
                  maxTicketsPerPlayer={initialSnapshot.game.maxTicketsPerPlayer - tickets.length}
                  buyCount={buyCount}
                  setBuyCount={setBuyCount}
                  buying={buying}
                  buyError={buyError}
                  onBuy={handleBuyTickets}
                  compact
                />
              )}
            </div>
          )}
        </div>
      </div>

      {status !== "COMPLETED" && (
        <Link
          href={`/games/${gameId}/fairness`}
          className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Verify this game is provably fair
        </Link>
      )}
    </div>
  );
}

function ConnectionIndicator({ state }: { state: "connecting" | "live" | "reconnecting" }) {
  if (state === "live") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600" title="Connected — receiving live updates">
        <Wifi className="h-3.5 w-3.5" /> Live
      </span>
    );
  }
  if (state === "reconnecting") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700" role="status">
        <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-slate-400" role="status">
      <Wifi className="h-3.5 w-3.5 animate-pulse" /> Connecting…
    </span>
  );
}

function SoundQuickToggle({ settings }: { settings: SoundSettings }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setSoundSettings({ sound: !settings.sound })}
        aria-pressed={settings.sound}
        aria-label={settings.sound ? "Mute sound" : "Unmute sound"}
        title={settings.sound ? "Mute sound" : "Unmute sound"}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        {settings.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => setSoundSettings({ vibration: !settings.vibration })}
        aria-pressed={settings.vibration}
        aria-label={settings.vibration ? "Disable vibration" : "Enable vibration"}
        title={settings.vibration ? "Disable vibration" : "Enable vibration"}
        className={clsx("rounded-lg p-1.5 hover:bg-slate-100", settings.vibration ? "text-slate-400 hover:text-slate-600" : "text-slate-300")}
      >
        <Vibrate className="h-4 w-4" />
      </button>
    </div>
  );
}

function ResultsScreen({ gameId, winners, prizePool, calledCount }: { gameId: string; winners: WinnerEntry[]; prizePool: string; calledCount: number }) {
  return (
    <div className="card space-y-4 border-2 border-gold-300 bg-gradient-to-b from-gold-50 to-white text-center">
      <div>
        <p className="text-2xl font-black text-ink-900">Game Complete</p>
        <p className="text-sm text-slate-500">
          {calledCount} numbers called · ETB {prizePool} total prize pool
        </p>
      </div>

      {winners.length > 0 ? (
        <div className="mx-auto max-w-sm space-y-2 text-left">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Winners</p>
          {winners.map((w) => (
            <div
              key={w.ticketId}
              className={clsx(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                w.isMine ? "bg-gold-100 font-semibold text-ink-900" : "bg-slate-50 text-slate-700",
              )}
            >
              <span>
                {w.isMine ? "You" : `Ticket #${w.ticketNumber}`}
                {w.username && !w.isMine ? ` (${w.username})` : ""}
              </span>
              <span className="font-mono">ETB {w.prizeAmount}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No winning tickets were recorded for this game.</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-sm">
        <Link href={`/games/${gameId}/fairness`} className="flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
          <ShieldCheck className="h-4 w-4" /> Verify this game was fair
        </Link>
        <Link href="/play" className="rounded-lg bg-ink-900 px-4 py-2 font-semibold text-white hover:bg-ink-800">
          Back to lobby
        </Link>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LIVE: "bg-red-50 text-red-600",
    PAUSED: "bg-amber-50 text-amber-700",
    OPEN: "bg-brand-50 text-brand-700",
    COMPLETED: "bg-slate-100 text-slate-500",
    CANCELLED: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", styles[status] ?? "bg-slate-100 text-slate-600")}>
      {status === "LIVE" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
      {status}
    </span>
  );
}

function BingoBoard({ calledSet }: { calledSet: Set<number> }) {
  return (
    <div className="card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Bingo board</p>
      <div className="grid grid-cols-5 gap-1">
        {LETTERS.map((letter) => (
          <div key={letter} className="pb-1 text-center text-xs font-bold text-brand-600">
            {letter}
          </div>
        ))}
        {Array.from({ length: 15 }, (_, row) =>
          LETTERS.map((letter) => {
            const [min] = RANGES[letter]!;
            const n = min + row;
            const called = calledSet.has(n);
            return (
              <div
                key={`${letter}${n}`}
                className={clsx(
                  "flex aspect-square items-center justify-center rounded text-[10px] font-semibold transition-colors sm:text-xs",
                  called ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-400",
                )}
              >
                {n}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function PlayerCard({ card, calledSet, won, manualMark }: { card: Card; calledSet: Set<number>; won: boolean; manualMark: boolean }) {
  // Purely a UI affordance — the server determines winners from calledNumbers
  // directly and never looks at this set. Manual mode just means the player
  // has to tap a called number to "dab" it, mimicking a physical card.
  const [dabbed, setDabbed] = useState<Set<number>>(new Set());

  function toggleDab(value: number) {
    if (!manualMark || !calledSet.has(value)) return;
    setDabbed((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div className={clsx("rounded-xl border-2 p-2", won ? "border-gold-500" : "border-slate-200")}>
      {manualMark && (
        <p className="mb-2 text-center text-[11px] font-medium text-slate-400">Manual mark — tap a called number to dab it</p>
      )}
      <div className="grid grid-cols-5 gap-1">
        {LETTERS.map((letter) => (
          <div key={letter} className="pb-1 text-center text-sm font-black text-brand-600">
            {letter}
          </div>
        ))}
        {Array.from({ length: 5 }, (_, row) =>
          LETTERS.map((letter) => {
            const value = card[letter][row] ?? null;
            const isFree = value === null;
            const isCalled = !isFree && calledSet.has(value);
            const marked = isFree || (manualMark ? !isFree && dabbed.has(value) : isCalled);
            return (
              <button
                key={`${letter}-${row}`}
                type="button"
                disabled={isFree || !manualMark || !isCalled}
                onClick={() => value !== null && toggleDab(value)}
                aria-pressed={marked}
                aria-label={isFree ? "Free space" : `${letter}-${value}${marked ? ", marked" : isCalled ? ", called, not yet marked" : ""}`}
                className={clsx(
                  "flex aspect-square items-center justify-center rounded-lg text-sm font-bold sm:text-base",
                  isFree
                    ? "bg-gold-500 text-ink-900"
                    : marked
                      ? "bg-brand-600 text-white"
                      : isCalled
                        ? "bg-white text-ink-900 ring-2 ring-brand-400"
                        : "bg-white text-ink-900 ring-1 ring-slate-200",
                  manualMark && isCalled && !marked && "cursor-pointer",
                )}
              >
                {isFree ? "FREE" : value}
              </button>
            );
          }),
        )}
      </div>
      {won && <p className="mt-2 text-center text-sm font-bold text-gold-600">🏆 Winning ticket!</p>}
    </div>
  );
}

const NOT_YET_OPEN_STATUSES = new Set(["DRAFT", "SCHEDULED"]);
const ALREADY_STARTED_STATUSES = new Set(["STARTING", "LIVE", "PAUSED"]);

function ticketSalesMessage(status: string): string {
  if (NOT_YET_OPEN_STATUSES.has(status)) return "Ticket sales haven't opened for this game yet — check back soon.";
  if (ALREADY_STARTED_STATUSES.has(status)) return "This game has already started, so ticket sales are closed.";
  if (status === "CANCELLED") return "This game was cancelled.";
  if (status === "COMPLETED") return "This game has ended.";
  return "Ticket sales are closed for this game.";
}

function BuyTicketPanel({
  canBuy,
  status,
  isAuthenticated,
  ticketPrice,
  maxTicketsPerPlayer,
  buyCount,
  setBuyCount,
  buying,
  buyError,
  onBuy,
  compact,
}: {
  canBuy: boolean;
  status: string;
  isAuthenticated: boolean;
  ticketPrice: string;
  maxTicketsPerPlayer: number;
  buyCount: number;
  setBuyCount: (n: number) => void;
  buying: boolean;
  buyError: string | null;
  onBuy: () => void;
  compact?: boolean;
}) {
  if (!isAuthenticated) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">
        <Link href="/login" className="font-semibold text-brand-700">
          Log in
        </Link>{" "}
        to buy a ticket.
      </div>
    );
  }
  if (!canBuy) {
    return <p className={compact ? "mt-3 text-xs text-slate-400" : "py-6 text-center text-sm text-slate-400"}>{ticketSalesMessage(status)}</p>;
  }
  return (
    <div className={compact ? "mt-4 border-t border-slate-100 pt-4" : ""}>
      {buyError && (
        <div className="mb-2">
          <Alert variant="error">{buyError}</Alert>
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-600">ETB {ticketPrice} per ticket</span>
      </div>

      <div className="mb-3">
        <span className="mb-1.5 block text-sm text-slate-600">Quantity</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ticket quantity">
          {[1, 2, 3, 5, 10].filter((n) => n <= maxTicketsPerPlayer).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBuyCount(n)}
              aria-pressed={buyCount === n}
              className={clsx(
                "min-w-[2.75rem] rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                buyCount === n ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {n}
            </button>
          ))}
          <input
            id="buyCount"
            type="number"
            min={1}
            max={maxTicketsPerPlayer}
            value={buyCount}
            onChange={(e) => setBuyCount(Math.max(1, Math.min(maxTicketsPerPlayer, Number(e.target.value) || 1)))}
            aria-label="Custom ticket quantity"
            className="input w-20"
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">Up to {maxTicketsPerPlayer} tickets per player.</p>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
        <span className="text-slate-500">
          {buyCount} ticket{buyCount > 1 ? "s" : ""} × ETB {ticketPrice}
        </span>
        <span className="font-bold text-ink-900">ETB {(Number(ticketPrice) * buyCount).toFixed(2)}</span>
      </div>

      <SubmitButton onClick={onBuy} loading={buying} className="w-full">
        Buy {buyCount} ticket{buyCount > 1 ? "s" : ""}
      </SubmitButton>
    </div>
  );
}
