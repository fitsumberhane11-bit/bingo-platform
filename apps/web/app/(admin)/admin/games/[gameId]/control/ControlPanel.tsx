"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Loader2, Play, Pause, PlayCircle, SkipForward, XCircle, CalendarClock, DoorOpen, Megaphone } from "lucide-react";
import { apiGet, apiPost, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";

interface GameDetail {
  id: string;
  name: string;
  status: string;
  callMode: string;
  callIntervalSeconds: number;
  calledCount: number;
  remainingCount: number;
  playerCount: number;
  ticketCount: number;
  prizePool: string;
  ticketSalesTotal: string;
  winningPattern: { name: string };
  seedCommitmentHash: string;
  seedRevealed: boolean;
  calledNumbers: { ballNumber: number; letter: string; sequenceNumber: number }[];
}

interface GameEventRow {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export function ControlPanel({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [events, setEvents] = useState<GameEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementScope, setAnnouncementScope] = useState<"GAME" | "ALL">("GAME");
  const [announcementSending, setAnnouncementSending] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [announcementSent, setAnnouncementSent] = useState(false);

  async function refresh() {
    try {
      const res = await apiGet<{ game: GameDetail; events: GameEventRow[] }>(`/api/admin/games/${gameId}`);
      setGame(res.game);
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load game.");
    }
  }

  useEffect(() => {
    refresh();
    const es = new EventSource(`/api/games/${gameId}/stream`);
    const onAny = () => refresh();
    for (const type of ["game:status", "game:number-called", "game:winner", "game:completed", "game:player-count", "game:ticket-purchased"]) {
      es.addEventListener(type, onAny);
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

  return (
    <div className="space-y-6">
      <Link href="/admin/games" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to games
      </Link>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{game.name}</h1>
          <p className="text-xs text-slate-500">{game.winningPattern.name}</p>
        </div>
        <StatusBadge status={game.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Players" value={String(game.playerCount)} />
        <Stat label="Tickets" value={String(game.ticketCount)} />
        <Stat label="Prize pool" value={`ETB ${game.prizePool}`} />
        <Stat label="Remaining balls" value={String(game.remainingCount)} />
      </div>

      <div className="card text-center">
        <p className="text-xs uppercase tracking-wide text-slate-400">Current ball</p>
        {currentNumber ? (
          <p className="font-mono text-4xl font-black text-ink-900">
            {currentNumber.letter}-{currentNumber.ballNumber}
          </p>
        ) : (
          <p className="text-slate-300">No calls yet</p>
        )}
        <p className="mt-1 text-xs text-slate-400">{game.calledCount} / 75 called</p>
      </div>

      {/* Controls */}
      <div className="card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Controls</p>
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
      </div>

      {/* Fairness */}
      <div className="card">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Provable fairness</p>
        <p className="break-all font-mono text-xs text-slate-500">{game.seedCommitmentHash}</p>
        <p className="mt-1 text-xs text-slate-400">
          {game.seedRevealed ? "Seed has been revealed — verifiable on the public fairness page." : "Seed remains sealed until the game completes."}
        </p>
      </div>

      {/* Called numbers */}
      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Called numbers ({game.calledNumbers.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {game.calledNumbers.map((c) => (
            <span key={c.sequenceNumber} className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-900">
              {c.letter}-{c.ballNumber}
            </span>
          ))}
          {game.calledNumbers.length === 0 && <span className="text-xs text-slate-300">None yet.</span>}
        </div>
      </div>

      {/* Event log */}
      <div className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Event log</p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold text-ink-900">{value}</p>
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
  return <span className={clsx("rounded-full px-3 py-1 text-sm font-semibold", styles[status] ?? "bg-slate-100 text-slate-600")}>{status}</span>;
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
