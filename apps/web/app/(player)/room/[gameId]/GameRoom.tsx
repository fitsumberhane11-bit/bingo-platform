"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Trophy, Users, Wallet, ShieldCheck, Megaphone, Ticket as TicketIcon, Volume2, VolumeX, Vibrate, Wifi, WifiOff, Plus, X, Ban, ChevronDown } from "lucide-react";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { playSound, unlockAudio, vibrate, getSoundSettings, setSoundSettings, subscribeSoundSettings, type SoundSettings } from "@/lib/sound";

type Card = { B: number[]; I: number[]; N: (number | null)[]; G: number[]; O: number[] };
type Ticket = {
  id: string;
  ticketNumber: number;
  cardNumbers: Card;
  status: string;
  disqualifiedReason: string | null;
  hasPendingClaim: boolean;
};
type CalledNumber = { ballNumber: number; letter: string; sequenceNumber: number };
type Announcement = { id: string; type: string; message: string; createdAt: string; expiresAt: string | null };
type WinnerEntry = {
  ticketId: string;
  ticketNumber: number;
  cardNumbers: Card | null;
  username: string;
  prizeAmount: string;
  ballNumberAtWin: number;
  isMine: boolean;
};
type VerifyClaim = { ticketId: string; ticketNumber: number; username: string; pattern: string; cardNumbers: Card };
type WinningStage = {
  id: string;
  order: number;
  label: string;
  patternName: string;
  prizeAmount: string;
  winnerLimit: number;
  winnerCount: number;
  status: "ACTIVE" | "COMPLETED";
};

export interface GameSnapshot {
  serverTimestamp: string;
  game: {
    id: string;
    name: string;
    gameCode: string;
    status: string;
    registrationCloseAt: string;
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
  disqualifiedCardCount: number;
  prizePool: string;
  winningStages: WinningStage[];
  announcements: Announcement[];
  winners: WinnerEntry[];
  playerTickets: Ticket[];
  pendingVerification: VerifyClaim | null;
}

function formatMilitaryTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </span>
  );
}

const GAME_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  OPEN: "Open",
  FULL: "Full",
  STARTING: "Starting",
  LIVE: "Playing",
  PAUSED: "Paused",
  COMPLETED: "Ended",
  CANCELLED: "Cancelled",
};

const LETTERS = ["B", "I", "N", "G", "O"] as const;
const RANGES: Record<string, [number, number]> = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };
const LETTER_COLORS: Record<string, string> = {
  B: "bg-brand-600",
  I: "bg-blue-600",
  N: "bg-purple-600",
  G: "bg-gold-500",
  O: "bg-red-600",
};

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
  const [disqualifiedCardCount, setDisqualifiedCardCount] = useState(initialSnapshot.disqualifiedCardCount);
  const [prizePool, setPrizePool] = useState(initialSnapshot.prizePool);
  const [winningStages, setWinningStages] = useState<WinningStage[]>(initialSnapshot.winningStages);
  const [tickets, setTickets] = useState(initialSnapshot.playerTickets);
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialSnapshot.announcements);
  const [winners, setWinners] = useState<WinnerEntry[]>(initialSnapshot.winners);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [winnerBanner, setWinnerBanner] = useState<{
    ticketNumber: number;
    username: string;
    prizeAmount: string;
    winnerCount: number;
    mine: boolean;
  } | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyCount, setBuyCount] = useState(1);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [soundSettings, setSoundSettingsState] = useState<SoundSettings>(() => getSoundSettings());
  const [claimFeedback, setClaimFeedback] = useState<Record<string, { status: "submitting" | "pending" | "invalid"; message: string }>>({});
  const [verifyClaim, setVerifyClaim] = useState<VerifyClaim | null>(initialSnapshot.pendingVerification);
  const [nowClock, setNowClock] = useState(() => new Date());

  useEffect(() => subscribeSoundSettings(setSoundSettingsState), []);

  useEffect(() => {
    const clock = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

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

  // Marks on an actually-called number are shared across every card the
  // player holds in this game — a number is either called or it isn't, so
  // dabbing it once should tick it off on every card that carries it
  // (Section: multi-card marking). Marks on a number that ISN'T called
  // (allowed deliberately — see PlayerCard's toggleDab) stay per-card:
  // that's the player's own mistake on that one specific card, not a fact
  // about the number, so it must not "correct" or affect their other cards.
  const calledDabStorageKey = `bingo-dabbed:${gameId}`;
  const [calledDabs, setCalledDabs] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(calledDabStorageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  function toggleCalledDab(value: number) {
    setCalledDabs((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      try {
        window.localStorage.setItem(calledDabStorageKey, JSON.stringify([...next]));
      } catch {
        /* localStorage unavailable (private browsing, quota) — marks just won't survive a reload */
      }
      return next;
    });
  }

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
      setWinningStages(data.winningStages);
      setDisqualifiedCardCount(data.disqualifiedCardCount);
      setAnnouncements(data.announcements);
      setWinners(data.winners);
      setVerifyClaim(data.pendingVerification);
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
    es.addEventListener("game:claim", (e) => {
      const data = JSON.parse(e.data);
      // Visible to EVERY player in the room, not just the claimant — lets
      // anyone cross-check the claimed card against the called numbers
      // themselves while the operator reviews it manually (transparency).
      if (data.result === "PENDING_REVIEW" && data.cardNumbers) {
        setVerifyClaim({ ticketId: data.ticketId, ticketNumber: data.ticketNumber, username: data.username ?? "", pattern: data.pattern, cardNumbers: data.cardNumbers });
      } else if (data.result === "REJECTED") {
        setVerifyClaim((prev) => (prev?.ticketId === data.ticketId ? null : prev));
      }
      if (!myTicketIds.current.has(data.ticketId)) return;
      if (data.result === "PENDING_REVIEW") {
        setTickets((prev) => prev.map((t) => (t.id === data.ticketId ? { ...t, hasPendingClaim: true } : t)));
        setClaimFeedback((prev) => ({ ...prev, [data.ticketId]: { status: "pending", message: "Bingo submitted — waiting for the operator to confirm." } }));
      } else if (data.result === "INVALID") {
        setClaimFeedback((prev) => ({ ...prev, [data.ticketId]: { status: "invalid", message: "Not a Bingo — this card doesn't satisfy the pattern yet." } }));
        playSound("error");
      } else if (data.result === "REJECTED") {
        setTickets((prev) => prev.map((t) => (t.id === data.ticketId ? { ...t, hasPendingClaim: false } : t)));
        setClaimFeedback((prev) => ({ ...prev, [data.ticketId]: { status: "invalid", message: data.reason ?? "Claim was not confirmed." } }));
      }
    });
    es.addEventListener("game:card-disqualified", (e) => {
      const data = JSON.parse(e.data);
      // This game-wide count is for every player in the room, not just the
      // one whose card it was — false-Bingo enforcement is visible to all,
      // same as the accompanying announcement.
      setDisqualifiedCardCount((prev) => prev + 1);
      if (!myTicketIds.current.has(data.ticketId)) return;
      setTickets((prev) => prev.map((t) => (t.id === data.ticketId ? { ...t, status: "DISQUALIFIED" } : t)));
    });
    es.addEventListener("game:winner", (e) => {
      const data = JSON.parse(e.data);
      const mine = myTicketIds.current.has(data.ticketId);
      setVerifyClaim((prev) => (prev?.ticketId === data.ticketId ? null : prev));
      setWinnerBanner({
        ticketNumber: data.ticketNumber,
        username: data.username ?? "",
        prizeAmount: data.prizeAmount,
        winnerCount: data.winnerCount,
        mine,
      });
      setWinners((prev) => [
        ...prev,
        {
          ticketId: data.ticketId,
          ticketNumber: data.ticketNumber,
          cardNumbers: data.cardNumbers ?? null,
          username: data.username ?? "",
          prizeAmount: data.prizeAmount,
          ballNumberAtWin: 0, // not shown in the results UI — the live game:winner event doesn't carry it
          isMine: mine,
        },
      ]);
      if (mine) {
        setTickets((prev) => prev.map((t) => (t.id === data.ticketId ? { ...t, status: "WINNER", hasPendingClaim: false } : t)));
        setClaimFeedback((prev) => ({ ...prev, [data.ticketId]: { status: "pending", message: "Confirmed! 🎉" } }));
      }
      if (typeof data.stageId === "string") {
        setWinningStages((prev) => prev.map((s) => (s.id === data.stageId ? { ...s, winnerCount: s.winnerCount + 1 } : s)));
      }
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
      setTickets((prev) => [...prev, ...res.tickets.map((t) => ({ ...t, disqualifiedReason: null, hasPendingClaim: false }))]);
      for (const t of res.tickets) myTicketIds.current.add(t.id);
      playSound("ticketPurchase");
      refreshWallet();
      setShowAddCard(false);
    } catch (err) {
      setBuyError(err instanceof ApiClientError ? err.message : "Purchase failed.");
      playSound("error");
    } finally {
      setBuying(false);
    }
  }

  async function handleClaim(ticketId: string, stageId?: string) {
    unlockAudio();
    setClaimFeedback((prev) => ({ ...prev, [ticketId]: { status: "submitting", message: "Checking your card…" } }));
    try {
      const res = await apiPost<{ won: boolean; invalidReason?: string; penalty: string }>(`/api/games/${gameId}/claim`, { ticketId, stageId });
      if (res.won) {
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, hasPendingClaim: true } : t)));
        setClaimFeedback((prev) => ({ ...prev, [ticketId]: { status: "pending", message: "Bingo submitted — waiting for the operator to confirm." } }));
      } else {
        setClaimFeedback((prev) => ({ ...prev, [ticketId]: { status: "invalid", message: res.invalidReason ?? "Not a Bingo yet." } }));
        if (res.penalty === "CARD_DISQUALIFIED") setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: "DISQUALIFIED" } : t)));
        playSound("error");
      }
    } catch (err) {
      setClaimFeedback((prev) => ({ ...prev, [ticketId]: { status: "invalid", message: err instanceof ApiClientError ? err.message : "Could not submit claim." } }));
    }
  }

  const canBuy = status === "OPEN" || status === "FULL";
  const activeAnnouncements = announcements.filter((a) => !a.expiresAt || new Date(a.expiresAt) > new Date());
  const canClaim = status === "LIVE" || status === "PAUSED";

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24">
      {/* Header */}
      <div className="card flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-ink-900">{initialSnapshot.game.name}</h1>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <LabeledField label="Game Code">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold tracking-wide text-ink-700" title="Game code — use this as a reference for winner claims and support">
                {initialSnapshot.game.gameCode}
              </span>
            </LabeledField>
            <LabeledField label="Time">
              <span className="font-mono text-slate-700">{formatMilitaryTime(nowClock)}</span>
            </LabeledField>
            <LabeledField label="Status">
              <StatusPill status={status} />
            </LabeledField>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <LabeledField label="Price">
              <span className="text-ink-800">ETB {initialSnapshot.game.ticketPrice} / card</span>
            </LabeledField>
            <LabeledField label="Number of Game">
              <span className="text-ink-800">{winningStages.length > 0 ? winningStages.length : 1}</span>
            </LabeledField>
            <LabeledField label="Prize">
              <span className="flex items-center gap-1 font-semibold text-gold-600">
                <Trophy className="h-3.5 w-3.5" /> ETB {prizePool}
              </span>
            </LabeledField>
          </div>

          <div className="mt-3 text-xs">
            <LabeledField label="Game Type">
              <span className="text-ink-800">{initialSnapshot.game.winningPattern.name}</span>
            </LabeledField>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ConnectionIndicator state={connectionState} />
          <span className="flex items-center gap-1 text-slate-500" title="Players in this game">
            <Users className="h-4 w-4" /> {playerCount}/{initialSnapshot.game.maxPlayers}
          </span>
          <span className="flex items-center gap-1 text-slate-500" title="Tickets sold">
            <TicketIcon className="h-4 w-4" /> {ticketCount}
          </span>
          {isAuthenticated && (
            <Link href="/wallet" className="flex items-center gap-1 font-semibold text-brand-700" title="Your wallet balance">
              <Wallet className="h-4 w-4" /> {walletBalance !== null ? `ETB ${walletBalance}` : "…"}
            </Link>
          )}
          <SoundQuickToggle settings={soundSettings} />
        </div>
      </div>

      {winningStages.length > 0 && <WinningRules stages={winningStages} />}

      {verifyClaim && <VerifyClaimPanel claim={verifyClaim} calledSet={calledSet} isMine={myTicketIds.current.has(verifyClaim.ticketId)} />}

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

      {/* Takes over the spot the "starting in Ns" countdown/announcement
          occupied — once the game has actually started, that slot shows
          live call progress instead of going blank. */}
      {countdown === null && (status === "LIVE" || status === "PAUSED") && (
        <div className="card flex items-center justify-center gap-1.5 py-2.5 text-sm text-slate-600">
          <span className="font-mono text-base font-bold text-ink-900">{calledNumbers.length}</span> of 75 balls called
        </div>
      )}

      {winnerBanner && (
        <div className={clsx("card text-center", winnerBanner.mine ? "bg-gold-500 text-ink-900" : "bg-brand-50")}>
          <p className="text-lg font-extrabold">🎉 BINGO! 🎉</p>
          <p className="text-sm">
            {winnerBanner.username || `Card #${winnerBanner.ticketNumber}`} won on Card #{winnerBanner.ticketNumber}
            {winnerBanner.mine && <span className="font-semibold"> (You!)</span>} — ETB {winnerBanner.prizeAmount}
            {winnerBanner.winnerCount > 1 && ` (split ${winnerBanner.winnerCount} ways)`}
          </p>
        </div>
      )}

      {status === "COMPLETED" && (
        <ResultsScreen gameId={gameId} winners={winners} prizePool={prizePool} calledCount={calledNumbers.length} calledSet={calledSet} />
      )}

      {/* Rolling Bingo balls */}
      <RollingBalls calledNumbers={calledNumbers} />

      {/* Called history */}
      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Called number history</p>
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1">
          {[...calledNumbers]
            .slice(-20)
            .reverse()
            .map((c) => (
              <span key={c.sequenceNumber} className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-900">
                {c.letter}-{c.ballNumber}
              </span>
            ))}
          {calledNumbers.length === 0 && <span className="text-xs text-slate-300">No numbers called yet.</span>}
        </div>
        {disqualifiedCardCount > 0 && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
            <Ban className="h-3.5 w-3.5" />
            {disqualifiedCardCount} card{disqualifiedCardCount === 1 ? "" : "s"} blocked for false Bingo
          </p>
        )}
      </div>

      <BingoBoard calledSet={calledSet} />

      {/* My cards */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">My cards</p>
        {tickets.length === 0 ? (
          <div className="card">
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
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tickets.map((t) => (
              <PlayerCard
                key={t.id}
                ticket={t}
                calledSet={calledSet}
                calledDabs={calledDabs}
                onToggleCalledDab={toggleCalledDab}
                canClaim={canClaim}
                stages={winningStages}
                feedback={claimFeedback[t.id]}
                onClaim={(stageId) => handleClaim(t.id, stageId)}
              />
            ))}
          </div>
        )}
      </div>

      {status !== "COMPLETED" && (
        <Link
          href={`/games/${gameId}/fairness`}
          className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Verify this game is provably fair
        </Link>
      )}

      {/* Floating "+" Add Card button (Section 7) */}
      {canBuy && (tickets.length === 0 || tickets.length < initialSnapshot.game.maxTicketsPerPlayer) && isAuthenticated && (
        <div className="fixed bottom-5 right-5 z-20">
          {showAddCard && (
            <div className="card mb-3 w-72 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add cards</p>
                <button type="button" onClick={() => setShowAddCard(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
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
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddCard((v) => !v)}
            aria-label="Add card"
            aria-expanded={showAddCard}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-700"
          >
            <Plus className="h-7 w-7" />
          </button>
        </div>
      )}
    </div>
  );
}

function WinningRules({ stages }: { stages: WinningStage[] }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Winning rules</p>
      <ul className="space-y-1.5 text-sm">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-ink-800">
              <span>{medals[i] ?? "🏆"}</span>
              <span className="font-semibold">{s.label}</span>
              <span className="text-slate-400">— {s.patternName}</span>
              {s.status === "COMPLETED" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">WON</span>}
            </span>
            <span className="font-mono font-bold text-gold-600">ETB {s.prizeAmount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Broadcasts the claimed card to every player in the room the moment
// someone submits a BINGO — visible to all, not just the claimant — so
// anyone can visually cross-check it against the called numbers while the
// operator reviews it manually (transparency). Unlike PlayerCard, this is
// read-only and auto-marks called cells directly: the whole point here is
// showing the objective truth of the card at a glance, not testing
// whether the viewer can spot it themselves.
// Read-only, auto-marked (every called cell is already highlighted, nothing
// for the viewer to tap) — used anywhere a card is shown for someone OTHER
// than its owner to check against the called numbers themselves: a
// pending-claim review (VerifyClaimPanel) or a settled winner's card
// (ResultsScreen's expandable rows). Unlike PlayerCard, this never affects
// or reads gameplay state — it's purely a transparency display.
function ReadOnlyCardGrid({ cardNumbers, calledSet }: { cardNumbers: Card; calledSet: Set<number> }) {
  return (
    <div className="mx-auto grid max-w-xs grid-cols-5 gap-1">
      {LETTERS.map((letter) => (
        <div key={letter} className="pb-1 text-center text-sm font-black text-brand-600">
          {letter}
        </div>
      ))}
      {Array.from({ length: 5 }, (_, row) =>
        LETTERS.map((letter) => {
          const value = cardNumbers[letter][row] ?? null;
          const isFree = value === null;
          const isCalled = !isFree && calledSet.has(value);
          return (
            <div
              key={`${letter}-${row}`}
              className={clsx(
                "flex aspect-square items-center justify-center rounded-lg text-sm font-bold sm:text-base",
                isFree ? "bg-gold-500 text-ink-900" : isCalled ? "bg-brand-600 text-white" : "bg-white text-ink-900 ring-1 ring-slate-200",
              )}
            >
              {isFree ? "FREE" : value}
            </div>
          );
        }),
      )}
    </div>
  );
}

function VerifyClaimPanel({ claim, calledSet, isMine }: { claim: VerifyClaim; calledSet: Set<number>; isMine: boolean }) {
  return (
    <div className="card border-2 border-gold-400 bg-gold-50/40">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">🔍 Verifying a BINGO claim — check it yourself</p>
      </div>
      <p className="mb-1 text-sm text-ink-800">
        <span className="font-semibold">{claim.username}</span> claims Card #{claim.ticketNumber} — {claim.pattern}. The operator is reviewing it now;
        every called number is already marked below so you can confirm it yourself.
      </p>
      {!isMine && (
        <p className="mb-2 inline-block rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
          Not one of your registered cards
        </p>
      )}
      <ReadOnlyCardGrid cardNumbers={claim.cardNumbers} calledSet={calledSet} />
    </div>
  );
}

function RollingBalls({ calledNumbers }: { calledNumbers: CalledNumber[] }) {
  const current = calledNumbers[calledNumbers.length - 1];
  const recent = [...calledNumbers].slice(-12).reverse();

  return (
    <div className="card">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Bingo balls</p>
      <div className="mb-4 flex flex-col items-center justify-center">
        {current ? (
          <div key={current.sequenceNumber} className="motion-safe:animate-ball-pop text-center">
            <p className="text-2xl font-black text-brand-600">{current.letter}</p>
            <p className="font-mono text-7xl font-black text-ink-900">{current.ballNumber}</p>
          </div>
        ) : (
          <p className="py-6 text-lg text-slate-300">Waiting for the game to start…</p>
        )}
        <p className="mt-2 text-xs text-slate-400">{calledNumbers.length} of 75 called</p>
      </div>

      {recent.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Recently called balls, most recent first">
          {recent.map((c, i) => (
            <div
              key={c.sequenceNumber}
              className={clsx(
                "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full font-mono text-white shadow-sm motion-safe:animate-roll-in",
                LETTER_COLORS[c.letter] ?? "bg-slate-500",
                i === 0 && "ring-2 ring-offset-2 ring-ink-900",
              )}
            >
              <span className="text-[9px] font-bold leading-none">{c.letter}</span>
              <span className="text-sm font-black leading-none">{c.ballNumber}</span>
            </div>
          ))}
        </div>
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

function ResultsScreen({
  gameId,
  winners,
  prizePool,
  calledCount,
  calledSet,
}: {
  gameId: string;
  winners: WinnerEntry[];
  prizePool: string;
  calledCount: number;
  calledSet: Set<number>;
}) {
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
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Winners</p>
          <p className="text-center text-[11px] text-slate-400">Tap a winner to check their card against the called numbers yourself.</p>
          {winners.map((w) => (
            <WinnerRow key={w.ticketId} winner={w} calledSet={calledSet} />
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

// One winner, collapsed to a single summary line by default; tapping it
// (the down arrow) expands the full card, every called cell already
// marked, so anyone — not just the winner — can check the win for
// themselves instead of taking the "confirmed" outcome on faith.
function WinnerRow({ winner: w, calledSet }: { winner: WinnerEntry; calledSet: Set<number> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={clsx("rounded-lg text-sm", w.isMine ? "bg-gold-100 font-semibold text-ink-900" : "bg-slate-50 text-slate-700")}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={!w.cardNumbers}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left disabled:cursor-default"
      >
        <span>
          {w.username} — Card #{w.ticketNumber}
          {w.isMine && <span className="ml-1 text-xs text-gold-600">(You)</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono">ETB {w.prizeAmount}</span>
          {w.cardNumbers && <ChevronDown className={clsx("h-4 w-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />}
        </span>
      </button>
      {expanded && w.cardNumbers && (
        <div className="border-t border-slate-200 bg-white p-3">
          <ReadOnlyCardGrid cardNumbers={w.cardNumbers} calledSet={calledSet} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LIVE: "bg-red-50 text-red-600",
    PAUSED: "bg-amber-50 text-amber-700",
    OPEN: "bg-brand-50 text-brand-700",
    COMPLETED: "bg-slate-100 text-slate-600",
    CANCELLED: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", styles[status] ?? "bg-slate-100 text-slate-600")}>
      {status === "LIVE" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
      {GAME_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// One row per letter (B/I/N/G/O) with its 15 numbers running across,
// instead of the old 15-row/5-column layout — same information, but wide
// and short like the Bingo Balls box above it instead of towering over it.
function BingoBoard({ calledSet }: { calledSet: Set<number> }) {
  return (
    <div className="card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bingo board</p>
      <div className="space-y-1">
        {LETTERS.map((letter) => {
          const [min] = RANGES[letter]!;
          return (
            <div key={letter} className="flex items-center gap-1">
              <div className="w-4 shrink-0 text-center text-[10px] font-bold text-brand-600 sm:text-xs">{letter}</div>
              <div className="grid flex-1 grid-cols-[repeat(15,minmax(0,1fr))] gap-0.5">
                {Array.from({ length: 15 }, (_, i) => {
                  const n = min + i;
                  const called = calledSet.has(n);
                  return (
                    <div
                      key={n}
                      className={clsx(
                        "flex aspect-square items-center justify-center rounded text-[8px] font-semibold transition-colors sm:text-[10px]",
                        called ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-400",
                      )}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerCard({
  ticket,
  calledSet,
  calledDabs,
  onToggleCalledDab,
  canClaim,
  stages,
  feedback,
  onClaim,
}: {
  ticket: Ticket;
  calledSet: Set<number>;
  calledDabs: Set<number>;
  onToggleCalledDab: (value: number) => void;
  canClaim: boolean;
  stages: WinningStage[];
  feedback?: { status: "submitting" | "pending" | "invalid"; message: string };
  onClaim: (stageId?: string) => void;
}) {
  const card = ticket.cardNumbers;
  const won = ticket.status === "WINNER";
  const disqualified = ticket.status === "DISQUALIFIED";

  // The player can tap ANY number on the card, not just ones that were
  // actually called — the server never auto-marks a cell on the player's
  // behalf (Section 11/28), and it never trusts this state either: winner
  // detection always reads calledNumbers directly against a submitted
  // claim, never this display-only marking. Marking a number that wasn't
  // called is allowed on purpose (it's the player's own mistake to make —
  // it can lead them to claim BINGO on a card that doesn't actually
  // qualify, which is exactly the realism being asked for) but it stays
  // local to THIS card only, unlike a genuinely-called mark (see
  // `calledDabs` on the parent, shared across every card the player
  // holds). Persisted to localStorage per ticket so a refresh or reconnect
  // doesn't wipe out marks the player already made.
  const mistakeDabStorageKey = `bingo-mistake-dabbed:${ticket.id}`;
  const [mistakeDabbed, setMistakeDabbed] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(mistakeDabStorageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [stagePicker, setStagePicker] = useState(false);

  function toggleDab(value: number) {
    if (calledSet.has(value)) {
      onToggleCalledDab(value);
      return;
    }
    setMistakeDabbed((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      try {
        window.localStorage.setItem(mistakeDabStorageKey, JSON.stringify([...next]));
      } catch {
        /* localStorage unavailable (private browsing, quota) — marks just won't survive a reload */
      }
      return next;
    });
  }

  const activeStages = stages.filter((s) => s.status === "ACTIVE");
  const claimDisabled = !canClaim || won || disqualified || ticket.hasPendingClaim || feedback?.status === "submitting";

  function handleBingoClick() {
    if (activeStages.length > 1) {
      setStagePicker(true);
      return;
    }
    onClaim(activeStages[0]?.id);
  }

  return (
    <div
      className={clsx(
        "rounded-xl border-2 p-2",
        won ? "border-gold-500" : disqualified ? "border-slate-300 opacity-60" : "border-slate-200",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-slate-400">Ticket #{ticket.ticketNumber} — tap a number to mark it (be careful — marking one that wasn&apos;t called is your own mistake)</p>
        {disqualified && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">Disqualified</span>}
      </div>
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
            const marked = isFree || (!isFree && (isCalled ? calledDabs.has(value) : mistakeDabbed.has(value)));
            return (
              <button
                key={`${letter}-${row}`}
                type="button"
                disabled={isFree}
                onClick={() => value !== null && toggleDab(value)}
                aria-pressed={marked}
                aria-label={isFree ? "Free space" : `${letter}-${value}${marked ? ", marked" : ", not marked"}`}
                className={clsx(
                  "flex aspect-square items-center justify-center rounded-lg text-sm font-bold sm:text-base",
                  // Deliberately no visual difference between "called, not yet
                  // dabbed" and "not called at all" — the player has to find
                  // their own matches against the called-numbers list rather
                  // than have the system point them out. Any number can now
                  // be tapped, called or not (see `disabled` above) — marking
                  // one that was never called is the player's own mistake to
                  // make, not something the UI prevents.
                  isFree ? "bg-gold-500 text-ink-900" : marked ? "bg-brand-600 text-white" : "bg-white text-ink-900 ring-1 ring-slate-200",
                  !isFree && !marked && "cursor-pointer",
                )}
              >
                {isFree ? "FREE" : value}
              </button>
            );
          }),
        )}
      </div>

      {won && <p className="mt-2 text-center text-sm font-bold text-gold-600">🏆 Winning ticket!</p>}
      {disqualified && ticket.disqualifiedReason && <p className="mt-2 text-center text-xs text-slate-400">{ticket.disqualifiedReason}</p>}

      {feedback && (
        <p
          className={clsx(
            "mt-2 rounded-lg px-2 py-1.5 text-center text-xs font-medium",
            feedback.status === "invalid" ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-800",
          )}
        >
          {feedback.status === "invalid" ? "❌ " : ""}
          {feedback.message}
        </p>
      )}

      {!won && !disqualified && canClaim && (
        <div className="mt-3">
          {stagePicker ? (
            <div className="space-y-1.5">
              <p className="text-center text-[11px] text-slate-400">Which prize are you claiming?</p>
              {activeStages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setStagePicker(false);
                    onClaim(s.id);
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  {s.label} — {s.patternName}
                </button>
              ))}
              <button type="button" onClick={() => setStagePicker(false)} className="w-full text-center text-xs text-slate-400 hover:text-slate-600">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleBingoClick}
              disabled={claimDisabled}
              className="w-full rounded-xl bg-gold-500 py-2.5 text-sm font-black uppercase tracking-wide text-ink-900 transition-transform hover:scale-[1.01] hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {ticket.hasPendingClaim ? "Awaiting confirmation…" : "BINGO!"}
            </button>
          )}
        </div>
      )}
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
    return (
      <p className={compact ? "mt-3 text-xs text-slate-400" : "py-6 text-center text-sm text-slate-400"}>
        {ticketSalesMessage(status)}
      </p>
    );
  }
  return (
    <div className={compact ? "" : ""}>
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
          {[1, 2, 3, 5, 10, 20].filter((n) => n <= maxTicketsPerPlayer).map((n) => (
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
        <p className="mt-1 text-xs text-slate-400">
          {maxTicketsPerPlayer > 50 ? "Add as many cards as you'd like." : `Up to ${maxTicketsPerPlayer} more card${maxTicketsPerPlayer === 1 ? "" : "s"} allowed.`}
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
        <span className="text-slate-500">
          {buyCount} card{buyCount > 1 ? "s" : ""} × ETB {ticketPrice}
        </span>
        <span className="font-bold text-ink-900">ETB {(Number(ticketPrice) * buyCount).toFixed(2)}</span>
      </div>

      <SubmitButton onClick={onBuy} loading={buying} className="w-full">
        Register {buyCount} card{buyCount > 1 ? "s" : ""} — pay ETB {(Number(ticketPrice) * buyCount).toFixed(2)}
      </SubmitButton>
      <p className="mt-1.5 text-center text-[11px] text-slate-400">
        Registering deducts the cost from your wallet immediately — cards aren&apos;t yours to play until payment goes through.
      </p>
    </div>
  );
}
