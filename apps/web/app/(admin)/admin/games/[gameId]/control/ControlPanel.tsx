"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Loader2, Play, Pause, PlayCircle, SkipForward, XCircle, CalendarClock, DoorOpen, Megaphone, StopCircle, Pencil, Check, X } from "lucide-react";
import { apiGet, apiPatch, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";

type Card = { B: number[]; I: number[]; N: (number | null)[]; G: number[]; O: number[] };
const LETTERS = ["B", "I", "N", "G", "O"] as const;
const LETTER_TEXT_COLORS: Record<string, string> = {
  B: "text-brand-600",
  I: "text-blue-600",
  N: "text-purple-600",
  G: "text-gold-600",
  O: "text-red-600",
};

function formatMilitaryTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateAndTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

interface GameDetail {
  id: string;
  name: string;
  gameCode: string;
  status: string;
  ticketPrice: string;
  callMode: string;
  callIntervalSeconds: number;
  calledCount: number;
  remainingCount: number;
  playerCount: number;
  ticketCount: number;
  prizePool: string;
  operatorPrizeAmount: string | null;
  ticketSalesTotal: string;
  winningPattern: { name: string };
  seedCommitmentHash: string;
  seedRevealed: boolean;
  calledNumbers: { ballNumber: number; letter: string; sequenceNumber: number }[];
}

interface WinningStageRow {
  id: string;
  order: number;
  label: string;
  patternName: string;
  prizeAmount: string;
  winnerLimit: number;
  winnerCount: number;
  status: "ACTIVE" | "COMPLETED";
}

interface ClaimRow {
  id: string;
  ticketId: string;
  ticketNumber: number;
  cardNumbers: Card;
  username: string;
  pattern: string;
  stageLabel: string | null;
  prizeAmount: string | null;
  validationStatus: "VALID" | "INVALID";
  invalidReason: string | null;
  confirmationStatus: "PENDING" | "CONFIRMED" | "REJECTED";
  submittedAt: string;
  confirmedAt: string | null;
}

interface GameEventRow {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

interface DisqualifiedTicketRow {
  ticketId: string;
  ticketNumber: number;
  username: string;
  reason: string | null;
  disqualifiedAt: string | null;
}

const PRIZE_LOCKED_STATUSES = new Set(["LIVE", "PAUSED", "COMPLETED", "CANCELLED"]);

// Ticket purchases only work while a game is OPEN or FULL (enforced
// server-side in purchaseTickets) — DRAFT and SCHEDULED both look "ready"
// at a glance but silently block every player trying to buy a card. This
// caused real confusion (an operator scheduled a game and stopped there,
// assuming that alone let players in) so the gap between "created" and
// "players can actually buy tickets" is spelled out here rather than left
// for the operator to infer from button labels alone.
const NEXT_STEP_HINT: Partial<Record<string, string>> = {
  DRAFT: "Players can't see or buy tickets for this game yet. Click Schedule, then Open registration, before announcing it.",
  SCHEDULED: "This game is scheduled but registration isn't open — players still can't buy tickets. Click \"Open registration\" to let them in.",
};

export function ControlPanel({ gameId, canManage }: { gameId: string; canManage: boolean }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [winningStages, setWinningStages] = useState<WinningStageRow[]>([]);
  const [pendingClaimCount, setPendingClaimCount] = useState(0);
  const [falseClaimCount, setFalseClaimCount] = useState(0);
  const [disqualifiedCardCount, setDisqualifiedCardCount] = useState(0);
  const [disqualifiedTickets, setDisqualifiedTickets] = useState<DisqualifiedTicketRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [events, setEvents] = useState<GameEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementScope, setAnnouncementScope] = useState<"GAME" | "ALL">("GAME");
  const [announcementSending, setAnnouncementSending] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [announcementSent, setAnnouncementSent] = useState(false);
  const [editingPrize, setEditingPrize] = useState(false);
  const [prizeInput, setPrizeInput] = useState("");
  const [prizeSaving, setPrizeSaving] = useState(false);
  const [rejectingClaimId, setRejectingClaimId] = useState<string | null>(null);
  const [disqualifyingTicketId, setDisqualifyingTicketId] = useState<string | null>(null);
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [nowClock, setNowClock] = useState(() => new Date());

  useEffect(() => {
    const clock = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  async function refresh() {
    try {
      const res = await apiGet<{
        game: GameDetail;
        winningStages: WinningStageRow[];
        pendingClaimCount: number;
        falseClaimCount: number;
        disqualifiedCardCount: number;
        disqualifiedTickets: DisqualifiedTicketRow[];
        events: GameEventRow[];
      }>(`/api/admin/games/${gameId}`);
      setGame(res.game);
      setWinningStages(res.winningStages);
      setPendingClaimCount(res.pendingClaimCount);
      setFalseClaimCount(res.falseClaimCount);
      setDisqualifiedCardCount(res.disqualifiedCardCount);
      setDisqualifiedTickets(res.disqualifiedTickets);
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load game.");
    }
  }

  async function refreshClaims() {
    try {
      const res = await apiGet<{ claims: ClaimRow[] }>(`/api/admin/games/${gameId}/claims`);
      setClaims(res.claims);
    } catch {
      /* the claims panel just stays stale until the next successful poll — not worth surfacing a second error banner */
    }
  }

  useEffect(() => {
    refresh();
    refreshClaims();
    const es = new EventSource(`/api/games/${gameId}/stream`);
    const onAny = () => refresh();
    const onClaim = () => {
      refresh();
      refreshClaims();
    };
    for (const type of ["game:status", "game:number-called", "game:winner", "game:completed", "game:player-count", "game:ticket-purchased"]) {
      es.addEventListener(type, onAny);
    }
    for (const type of ["game:claim", "game:card-disqualified"]) {
      es.addEventListener(type, onClaim);
    }
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  async function runAction(action: string, path: string, body?: unknown) {
    setActionLoading(action);
    setError(null);
    try {
      await apiPost(`/api/admin/games/${gameId}/${path}`, body);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Action failed.");
    } finally {
      setActionLoading(null);
    }
  }

  async function savePrize() {
    setPrizeSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/admin/games/${gameId}/prize`, { amount: Number(prizeInput) });
      setEditingPrize(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to set prize amount.");
    } finally {
      setPrizeSaving(false);
    }
  }

  async function confirmClaim(claimId: string) {
    setActionLoading(`confirm-${claimId}`);
    setError(null);
    try {
      await apiPost(`/api/admin/games/${gameId}/claims/${claimId}/confirm`, {});
      await Promise.all([refresh(), refreshClaims()]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to confirm claim.");
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectClaim(claimId: string) {
    setActionLoading(`reject-${claimId}`);
    setError(null);
    try {
      await apiPost(`/api/admin/games/${gameId}/claims/${claimId}/reject`, { reason: rejectReason });
      setRejectingClaimId(null);
      setRejectReason("");
      await Promise.all([refresh(), refreshClaims()]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to reject claim.");
    } finally {
      setActionLoading(null);
    }
  }

  async function disqualifyCard(ticketId: string) {
    setActionLoading(`disqualify-${ticketId}`);
    setError(null);
    try {
      await apiPost(`/api/admin/games/${gameId}/tickets/${ticketId}/disqualify`, { reason: disqualifyReason });
      setDisqualifyingTicketId(null);
      setDisqualifyReason("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to disqualify card.");
    } finally {
      setActionLoading(null);
    }
  }

  async function sendAnnouncement() {
    setAnnouncementSending(true);
    setAnnouncementError(null);
    try {
      await apiPost("/api/admin/announcements", {
        message: announcementMessage,
        type: "IMPORTANT",
        targetType: announcementScope,
        gameId: announcementScope === "GAME" ? gameId : undefined,
      });
      setAnnouncementMessage("");
      setShowAnnouncementForm(false);
      setAnnouncementSent(true);
      setTimeout(() => setAnnouncementSent(false), 4000);
    } catch (err) {
      setAnnouncementError(err instanceof ApiClientError ? err.message : "Failed to send announcement.");
    } finally {
      setAnnouncementSending(false);
    }
  }

  if (!game) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentNumber = game.calledNumbers[game.calledNumbers.length - 1];
  const calledSet = new Set(game.calledNumbers.map((c) => c.ballNumber));
  const prizeLocked = PRIZE_LOCKED_STATUSES.has(game.status);
  const pendingClaims = claims.filter((c) => c.validationStatus === "VALID" && c.confirmationStatus === "PENDING");
  const resolvedClaims = claims.filter((c) => !(c.validationStatus === "VALID" && c.confirmationStatus === "PENDING"));
  const confirmedClaims = claims.filter((c) => c.confirmationStatus === "CONFIRMED");

  return (
    <div className="space-y-6">
      <Link href="/admin/games" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to games
      </Link>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Game information */}
      <div className="card">
        <h1 className="text-xl font-bold text-ink-900">{game.name}</h1>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <LabeledField label="Game Code">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold tracking-wide text-ink-700" title="Game code — reference for winner claims and support">
              {game.gameCode}
            </span>
          </LabeledField>
          <LabeledField label="Time">
            <span className="font-mono text-slate-700">{formatMilitaryTime(nowClock)}</span>
          </LabeledField>
          <LabeledField label="Status">
            <StatusBadge status={game.status} />
          </LabeledField>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <LabeledField label="Price">
            <span className="text-ink-800">ETB {game.ticketPrice} / card</span>
          </LabeledField>
          <LabeledField label="Number of Game">
            <span className="text-ink-800">{winningStages.length > 0 ? winningStages.length : 1}</span>
          </LabeledField>
          <LabeledField label="Prize">
            <span className="font-semibold text-gold-600">ETB {game.prizePool}</span>
          </LabeledField>
        </div>

        <div className="mt-3 text-xs">
          <LabeledField label="Game Type">
            <span className="text-ink-800">{game.winningPattern.name}</span>
          </LabeledField>
        </div>
      </div>

      {game.status === "COMPLETED" && (
        <div className="card border-2 border-gold-300 bg-gold-50/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold-700">🏁 Game ended</p>
          {confirmedClaims.length === 0 ? (
            <p className="text-sm text-slate-500">No winner was confirmed for this game.</p>
          ) : (
            <ul className="space-y-1.5">
              {confirmedClaims.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="font-semibold text-ink-900">
                    {c.username} — Card #{c.ticketNumber}
                  </span>
                  <span className="text-slate-500">{c.confirmedAt ? formatDateAndTime(c.confirmedAt) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Players" value={String(game.playerCount)} />
        <Stat label="Cards" value={String(game.ticketCount)} />
        <PrizeStat
          prizePool={game.prizePool}
          locked={prizeLocked}
          editing={editingPrize}
          value={prizeInput}
          saving={prizeSaving}
          canEdit={canManage}
          onEdit={() => {
            setPrizeInput(game.operatorPrizeAmount ?? game.prizePool);
            setEditingPrize(true);
          }}
          onChange={setPrizeInput}
          onSave={savePrize}
          onCancel={() => setEditingPrize(false)}
        />
        <Stat label="Remaining balls" value={String(game.remainingCount)} />
      </div>

      {winningStages.length > 0 && (
        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Winning rules</p>
          <ul className="space-y-1">
            {winningStages.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>
                  {s.label} <span className="text-slate-400">— {s.patternName}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {s.winnerCount}/{s.winnerLimit} won
                  </span>
                  <span className="font-mono font-bold text-gold-600">ETB {s.prizeAmount}</span>
                  {s.status === "COMPLETED" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">DONE</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">Current ball</p>
        {currentNumber ? (
          <p className="font-mono text-4xl font-black text-ink-900">
            {currentNumber.letter}-{currentNumber.ballNumber}
          </p>
        ) : (
          <p className="text-slate-300">No calls yet</p>
        )}
        <p className="mt-1 text-xs text-slate-400">{game.calledCount} / 75 called</p>
      </div>

      {/* Game control */}
      <div className="card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Game control</p>
        {!canManage ? (
          <p className="text-sm text-slate-400">View-only access — an operator runs this game.</p>
        ) : (
          <>
        {NEXT_STEP_HINT[game.status] && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{NEXT_STEP_HINT[game.status]}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {game.status === "DRAFT" && (
            <ActionButton icon={CalendarClock} label="Schedule" loading={actionLoading === "schedule"} onClick={() => runAction("schedule", "schedule")} />
          )}
          {game.status === "SCHEDULED" && (
            <ActionButton icon={DoorOpen} label="Open registration" loading={actionLoading === "open"} onClick={() => runAction("open", "open")} />
          )}
          {(game.status === "OPEN" || game.status === "FULL") && (
            <ActionButton icon={Play} label="Start game" loading={actionLoading === "start"} onClick={() => runAction("start", "start")} primary />
          )}
          {game.status === "LIVE" && (
            <>
              {game.callMode === "MANUAL" && (
                <ActionButton
                  icon={SkipForward}
                  label="Call next number"
                  loading={actionLoading === "call-next"}
                  onClick={() => runAction("call-next", "call-next")}
                  primary
                />
              )}
              <ActionButton icon={Pause} label="Pause" loading={actionLoading === "pause"} onClick={() => runAction("pause", "pause")} />
            </>
          )}
          {game.status === "PAUSED" && (
            <ActionButton icon={PlayCircle} label="Resume" loading={actionLoading === "resume"} onClick={() => runAction("resume", "resume")} primary />
          )}
          {(game.status === "LIVE" || game.status === "PAUSED") && (
            <ActionButton icon={StopCircle} label="End game" onClick={() => setShowEndConfirm(true)} />
          )}
          {["DRAFT", "SCHEDULED", "OPEN", "FULL", "STARTING", "LIVE", "PAUSED"].includes(game.status) && (
            <ActionButton icon={XCircle} label="Cancel game" danger onClick={() => setShowCancelConfirm(true)} />
          )}
          {["OPEN", "FULL", "STARTING", "LIVE", "PAUSED"].includes(game.status) && (
            <ActionButton icon={Megaphone} label="Send announcement" onClick={() => setShowAnnouncementForm((v) => !v)} />
          )}
        </div>

        {announcementSent && (
          <div className="mt-4">
            <Alert variant="success">Announcement sent.</Alert>
          </div>
        )}

        {showAnnouncementForm && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {announcementError && (
              <div className="mb-2">
                <Alert variant="error">{announcementError}</Alert>
              </div>
            )}
            <textarea
              className="input mb-3"
              placeholder="Welcome to tonight's Bingo! The game will begin shortly."
              aria-label="Announcement message"
              value={announcementMessage}
              onChange={(e) => setAnnouncementMessage(e.target.value)}
              rows={2}
              maxLength={1000}
            />
            <div className="mb-3 flex items-center gap-4 text-sm text-slate-600">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={announcementScope === "GAME"} onChange={() => setAnnouncementScope("GAME")} />
                This game only
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={announcementScope === "ALL"} onChange={() => setAnnouncementScope("ALL")} />
                All players, platform-wide
              </label>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={announcementMessage.trim().length < 1 || announcementSending} onClick={sendAnnouncement}>
                {announcementSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
              </button>
              <button className="btn-secondary" onClick={() => setShowAnnouncementForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showEndConfirm && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-semibold text-amber-800">End this game now?</p>
            <p className="mb-3 text-xs text-amber-700">
              Calling stops immediately and the game moves to Completed. Use this once all prizes are won, or to stop the session early. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={actionLoading === "end"}
                onClick={async () => {
                  await runAction("end", "end");
                  setShowEndConfirm(false);
                }}
              >
                Confirm — end game
              </button>
              <button className="btn-secondary" onClick={() => setShowEndConfirm(false)}>
                Never mind
              </button>
            </div>
          </div>
        )}

        {showCancelConfirm && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="mb-2 text-sm font-semibold text-red-800">Are you sure you want to cancel this game?</p>
            <p className="mb-3 text-xs text-red-700">
              {game.status === "LIVE" || game.status === "PAUSED"
                ? "This game is in progress. No automatic refund will be issued — affected players will be notified and Finance will review refunds manually. This cannot be undone."
                : "Every active ticket will be refunded automatically. This cannot be undone."}
            </p>
            <textarea
              className="input mb-3"
              placeholder="Reason (required)"
              aria-label="Cancellation reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <button
                className="btn-danger"
                disabled={cancelReason.trim().length < 3 || actionLoading === "cancel"}
                onClick={async () => {
                  await runAction("cancel", "cancel", { reason: cancelReason });
                  setShowCancelConfirm(false);
                  setCancelReason("");
                }}
              >
                Confirm cancellation
              </button>
              <button className="btn-secondary" onClick={() => setShowCancelConfirm(false)}>
                Never mind
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Called numbers + Winning claims, side by side — a claimed card needs
          to be checked against exactly this list before confirming, so both
          live in the same view instead of the claim being scrolled away
          from the numbers it's supposed to be verified against. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
      {/* Called numbers */}
      <div className="card lg:sticky lg:top-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Called numbers ({game.calledNumbers.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {game.calledNumbers.map((c) => (
            <span key={c.sequenceNumber} className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-900">
              {c.letter}-{c.ballNumber}
            </span>
          ))}
          {game.calledNumbers.length === 0 && <span className="text-xs text-slate-300">None yet.</span>}
        </div>
      </div>

      {/* Winning claims */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Winning claims</p>
          <div className="flex gap-2 text-[11px] text-slate-400">
            <span>{pendingClaims.length} pending</span>
            <span>·</span>
            <span>{falseClaimCount} false</span>
            <span>·</span>
            <span>{disqualifiedCardCount} disqualified cards</span>
          </div>
        </div>

        {pendingClaims.length === 0 && resolvedClaims.length === 0 && <p className="text-sm text-slate-300">No claims submitted yet.</p>}

        {pendingClaims.length > 0 && (
          <div className="mb-4 space-y-3">
            {pendingClaims.map((c) => (
              <div key={c.id} className="rounded-xl border border-gold-300 bg-gold-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-900">
                    {c.username} · Card #{c.ticketNumber}
                  </p>
                  <span className="text-xs text-slate-500">{new Date(c.submittedAt).toLocaleTimeString()}</span>
                </div>
                <p className="mb-2 text-xs text-slate-600">
                  Claiming {c.stageLabel ?? c.pattern} — {c.pattern}
                  {c.prizeAmount && <> · ETB {c.prizeAmount}</>}
                </p>
                <div className="mb-3 space-y-0.5 text-xs text-emerald-700">
                  <p>✓ Card belongs to player</p>
                  <p>✓ Game is {game.status}</p>
                  <p>✓ Required numbers called</p>
                  <p>✓ Pattern satisfied — automatically verified by the server</p>
                  <p>✓ No previous winning claim on this card</p>
                </div>
                <MiniCardGrid cardNumbers={c.cardNumbers} calledSet={calledSet} />
                {!canManage ? (
                  <p className="text-xs text-slate-400">Awaiting operator review.</p>
                ) : rejectingClaimId === c.id ? (
                  <div>
                    <textarea
                      className="input mb-2"
                      placeholder="Reason for rejecting (required)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-danger"
                        disabled={rejectReason.trim().length < 3 || actionLoading === `reject-${c.id}`}
                        onClick={() => rejectClaim(c.id)}
                      >
                        Confirm reject
                      </button>
                      <button className="btn-secondary" onClick={() => setRejectingClaimId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={actionLoading === `confirm-${c.id}`} onClick={() => confirmClaim(c.id)}>
                      {actionLoading === `confirm-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm winner"}
                    </button>
                    <button className="btn-secondary" onClick={() => setRejectingClaimId(c.id)}>
                      Reject claim
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {resolvedClaims.length > 0 && (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs">
            {resolvedClaims.map((c) => {
              const alreadyBlocked = disqualifiedTickets.some((t) => t.ticketId === c.ticketId);
              return (
                <li key={c.id} className="border-b border-slate-50 pb-1.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-800">
                      {c.username} · Card #{c.ticketNumber} · {c.pattern}
                    </span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 font-semibold",
                        c.validationStatus === "INVALID"
                          ? "bg-red-50 text-red-600"
                          : c.confirmationStatus === "CONFIRMED"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {c.validationStatus === "INVALID" ? "False Bingo" : c.confirmationStatus}
                    </span>
                  </div>
                  {c.validationStatus === "INVALID" && canManage && !alreadyBlocked && (
                    <div className="mt-1">
                      {disqualifyingTicketId === c.ticketId ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            className="input h-7 flex-1 text-xs"
                            placeholder="Reason (required)"
                            value={disqualifyReason}
                            onChange={(e) => setDisqualifyReason(e.target.value)}
                          />
                          <button
                            className="btn-danger h-7 px-2 text-[11px]"
                            disabled={disqualifyReason.trim().length < 3 || actionLoading === `disqualify-${c.ticketId}`}
                            onClick={() => disqualifyCard(c.ticketId)}
                          >
                            Confirm
                          </button>
                          <button className="btn-secondary h-7 px-2 text-[11px]" onClick={() => setDisqualifyingTicketId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="text-[11px] font-semibold text-red-600 hover:underline"
                          onClick={() => {
                            setDisqualifyingTicketId(c.ticketId);
                            setDisqualifyReason(`False Bingo claim on Card #${c.ticketNumber}.`);
                          }}
                        >
                          Disqualify this card
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </div>

      {/* Blocked cards */}
      {disqualifiedTickets.length > 0 && (
        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Blocked cards (false Bingo)</p>
          <ul className="space-y-1.5">
            {disqualifiedTickets.map((t) => (
              <li key={t.ticketId} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
                <span>
                  <span className="font-medium text-ink-900">{t.username}</span>{" "}
                  <span className="font-mono text-slate-500">Card #{t.ticketNumber}</span>
                </span>
                <span className="text-xs text-red-600">{t.reason ?? "Disqualified"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fairness */}
      <div className="card">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Provable fairness</p>
        <p className="break-all font-mono text-xs text-slate-500">{game.seedCommitmentHash}</p>
        <p className="mt-1 text-xs text-slate-400">
          {game.seedRevealed ? "Seed has been revealed — verifiable on the public fairness page." : "Seed remains sealed until the game completes."}
        </p>
      </div>

      {/* Activity feed */}
      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-slate-50 pb-1.5 last:border-0">
              <span className="font-medium text-ink-900">{e.type}</span>
              <span className="text-slate-400">{new Date(e.createdAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// The claimed card's actual numbers, laid out just like the player's own
// board, so the operator can visually check the claim against the "Called
// numbers" panel right next to it instead of trusting the checkmarks
// above on faith — the same transparency players get via the room's own
// claim-verification panel.
function MiniCardGrid({ cardNumbers, calledSet }: { cardNumbers: Card; calledSet: Set<number> }) {
  return (
    <div className="mx-auto mb-3 grid max-w-[220px] grid-cols-5 gap-1">
      {LETTERS.map((letter) => (
        <div key={letter} className={clsx("pb-0.5 text-center text-[10px] font-black", LETTER_TEXT_COLORS[letter])}>
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
                "flex aspect-square items-center justify-center rounded text-[11px] font-bold",
                isFree ? "bg-gold-500 text-ink-900" : isCalled ? "bg-brand-600 text-white" : "bg-white text-ink-900 ring-1 ring-slate-200 dark:bg-ink-800",
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-ink-900">{value}</p>
    </div>
  );
}

function PrizeStat({
  prizePool,
  locked,
  editing,
  value,
  saving,
  canEdit,
  onEdit,
  onChange,
  onSave,
  onCancel,
}: {
  prizePool: string;
  locked: boolean;
  editing: boolean;
  value: string;
  saving: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="card py-3 text-center">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Prize amount</p>
        <div className="mt-1 flex items-center justify-center gap-1">
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Prize amount"
            className="w-20 rounded-lg border border-slate-200 px-1.5 py-1 text-center text-sm font-bold"
          />
          <button aria-label="Save prize amount" disabled={saving} onClick={onSave} className="text-emerald-600 hover:text-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button aria-label="Cancel" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="card py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Prize pool</p>
      <div className="mt-0.5 flex items-center justify-center gap-1.5">
        <p className="text-lg font-bold text-ink-900">ETB {prizePool}</p>
        {!locked && canEdit && (
          <button aria-label="Edit prize amount" onClick={onEdit} className="text-slate-400 hover:text-slate-600">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {locked && <p className="text-[10px] text-slate-300">Locked</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LIVE: "bg-red-50 text-red-600",
    OPEN: "bg-brand-50 text-brand-700",
    PAUSED: "bg-amber-50 text-amber-700",
    COMPLETED: "bg-slate-100 text-slate-500",
    CANCELLED: "bg-slate-100 text-slate-400",
  };
  return (
    <span className={clsx("rounded-full px-3 py-1 text-sm font-semibold", styles[status] ?? "bg-slate-100 text-slate-600")}>
      {GAME_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  primary,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  loading?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading} className={danger ? "btn-danger" : primary ? "btn-primary" : "btn-secondary"}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
