"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, apiPut, ApiClientError } from "@/lib/api-client";

interface Option {
  id: string;
  name: string;
  description?: string | null;
}

interface StageDraft {
  key: number;
  label: string;
  patternId: string;
  prizeAmount: string;
  winnerLimit: string;
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

let stageKeySeq = 0;

export function CreateGameForm({ patterns, prizeRules }: { patterns: Option[]; prizeRules: Option[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [stages, setStages] = useState<StageDraft[]>([]);

  const now = new Date();
  // Wide by default on purpose: creating, scheduling, and opening a game
  // are each a separate manual click, and registration silently stops
  // accepting purchases the moment registrationCloseAt passes — a tight
  // default window here means a game can go stale mid-setup before an
  // operator even gets to "Open registration". Easy to shorten per-game;
  // costly to have to notice it happened after the fact.
  const defaultStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const defaultRegClose = new Date(now.getTime() + 90 * 60 * 1000);

  function addStage() {
    setStages((prev) => [
      ...prev,
      { key: stageKeySeq++, label: "", patternId: patterns[0]?.id ?? "", prizeAmount: "", winnerLimit: "1" },
    ]);
  }

  function updateStage(key: number, patch: Partial<StageDraft>) {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeStage(key: number) {
    setStages((prev) => prev.filter((s) => s.key !== key));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const operatorPrizeAmountRaw = String(form.get("operatorPrizeAmount") ?? "").trim();
    const warnAt = Number(form.get("warnAt") || 1);
    const disqualifyCardAt = Number(form.get("disqualifyCardAt") || 2);
    const removePlayerAt = Number(form.get("removePlayerAt") || 3);

    const payload = {
      name: String(form.get("name")),
      description: String(form.get("description") ?? "") || undefined,
      gameDate: new Date(String(form.get("startTime"))).toISOString(),
      startTime: new Date(String(form.get("startTime"))).toISOString(),
      registrationOpenAt: new Date(String(form.get("registrationOpenAt"))).toISOString(),
      registrationCloseAt: new Date(String(form.get("registrationCloseAt"))).toISOString(),
      ticketPrice: Number(form.get("ticketPrice")),
      maxPlayers: Number(form.get("maxPlayers")),
      maxTicketsPerPlayer: Number(form.get("maxTicketsPerPlayer")),
      minPlayers: Number(form.get("minPlayers")),
      jackpotAmount: Number(form.get("jackpotAmount") || 0),
      callIntervalSeconds: Number(form.get("callIntervalSeconds")),
      callMode: String(form.get("callMode")),
      manualMarkEnabled: true,
      winningPatternId: String(form.get("winningPatternId")),
      prizeRuleId: String(form.get("prizeRuleId")),
      operatorPrizeAmount: operatorPrizeAmountRaw ? Number(operatorPrizeAmountRaw) : undefined,
      falseBingoPolicy: { warnAt, disqualifyCardAt, removePlayerAt },
    };

    try {
      const res = await apiPost<{ game: { id: string } }>("/api/admin/games", payload);

      if (stages.length > 0) {
        await apiPut(`/api/admin/games/${res.game.id}/stages`, {
          stages: stages.map((s, i) => ({
            order: i + 1,
            patternId: s.patternId,
            label: s.label || undefined,
            prizeAmount: Number(s.prizeAmount),
            winnerLimit: Number(s.winnerLimit || 1),
          })),
        });
      }

      router.push(`/admin/games/${res.game.id}/control`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <FormField label="Game name" name="name" required error={fieldErrors.name?.[0]} />
      <div>
        <label className="label" htmlFor="description">
          Description
        </label>
        <textarea id="description" name="description" rows={2} className="input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Registration opens"
          name="registrationOpenAt"
          type="datetime-local"
          defaultValue={toLocalInputValue(now)}
          required
          error={fieldErrors.registrationOpenAt?.[0]}
        />
        <FormField
          label="Registration closes"
          name="registrationCloseAt"
          type="datetime-local"
          defaultValue={toLocalInputValue(defaultRegClose)}
          required
          error={fieldErrors.registrationCloseAt?.[0]}
        />
        <FormField
          label="Start time"
          name="startTime"
          type="datetime-local"
          defaultValue={toLocalInputValue(defaultStart)}
          required
          error={fieldErrors.startTime?.[0]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Ticket price (ETB)"
          name="ticketPrice"
          type="number"
          min={1}
          step="0.01"
          defaultValue={10}
          required
          error={fieldErrors.ticketPrice?.[0]}
        />
        <FormField
          label="Max players"
          name="maxPlayers"
          type="number"
          min={2}
          defaultValue={100}
          required
          error={fieldErrors.maxPlayers?.[0]}
        />
        <FormField
          label="Max cards / player"
          name="maxTicketsPerPlayer"
          type="number"
          min={1}
          defaultValue={1000}
          required
          hint="Defaults to effectively unlimited so players can add as many cards as they want before the game starts."
          error={fieldErrors.maxTicketsPerPlayer?.[0]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Min players to start"
          name="minPlayers"
          type="number"
          min={1}
          defaultValue={2}
          required
          error={fieldErrors.minPlayers?.[0]}
        />
        <FormField
          label="Jackpot (ETB, optional)"
          name="jackpotAmount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={0}
          error={fieldErrors.jackpotAmount?.[0]}
        />
        <FormField
          label="Ball call interval (seconds)"
          name="callIntervalSeconds"
          type="number"
          min={5}
          max={120}
          defaultValue={10}
          required
          error={fieldErrors.callIntervalSeconds?.[0]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="callMode">
            Game mode
          </label>
          <select id="callMode" name="callMode" className="input" defaultValue="AUTO">
            <option value="AUTO">Automatic (server calls on a timer)</option>
            <option value="MANUAL">Controlled (operator triggers each call)</option>
          </select>
        </div>
        <FormField
          label="Prize amount (ETB, optional)"
          name="operatorPrizeAmount"
          type="number"
          min={0.01}
          step="0.01"
          placeholder="Leave blank to use the prize rule below instead"
          error={fieldErrors.operatorPrizeAmount?.[0]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="winningPatternId">
            Winning pattern (base / default)
          </label>
          <select id="winningPatternId" name="winningPatternId" className="input" required>
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Used when no additional prize stages are configured below.</p>
          {fieldErrors.winningPatternId?.[0] && <p className="field-error">{fieldErrors.winningPatternId[0]}</p>}
        </div>
        <div>
          <label className="label" htmlFor="prizeRuleId">
            Prize rule
          </label>
          <select id="prizeRuleId" name="prizeRuleId" className="input" required>
            {prizeRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Only used if no prize amount is set above.</p>
          {fieldErrors.prizeRuleId?.[0] && <p className="field-error">{fieldErrors.prizeRuleId[0]}</p>}
        </div>
      </div>

      {/* Multiple games in one session (Section 6) */}
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink-900">Multiple games in this session (optional, up to 3)</p>
            <p className="text-xs text-slate-400">
              Each one is its own round, played against the same running numbers with the same cards, with its own rule and its own prize — e.g.
              &ldquo;Game 1: One Line — ETB 100&rdquo; then &ldquo;Game 2: Full House — ETB 250&rdquo;.
            </p>
          </div>
          <button type="button" onClick={addStage} className="btn-secondary" disabled={stages.length >= 3}>
            <Plus className="h-4 w-4" /> Add game
          </button>
        </div>

        {stages.length === 0 ? (
          <p className="text-xs text-slate-300">No additional games — this session will use just the base winning pattern above.</p>
        ) : (
          <div className="space-y-3">
            {stages.map((s, i) => (
              <div key={s.key} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-3">
                  <label className="label text-xs">Label</label>
                  <input
                    className="input"
                    placeholder={`Game ${i + 1}`}
                    value={s.label}
                    onChange={(e) => updateStage(s.key, { label: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="label text-xs">Pattern</label>
                  <select className="input" value={s.patternId} onChange={(e) => updateStage(s.key, { patternId: e.target.value })}>
                    {patterns.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-xs">Prize (ETB)</label>
                  <input
                    className="input"
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={s.prizeAmount}
                    onChange={(e) => updateStage(s.key, { prizeAmount: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-xs">Winner limit</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={s.winnerLimit}
                    onChange={(e) => updateStage(s.key, { winnerLimit: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <button type="button" aria-label="Remove stage" onClick={() => removeStage(s.key)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* False-Bingo policy (Section 16) */}
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-1 text-sm font-semibold text-ink-900">False-Bingo policy</p>
        <p className="mb-3 text-xs text-slate-400">
          How many incorrect BINGO claims before each escalation. Conservative defaults — a warning, then the card is disqualified, then the player
          is removed from this game only. No account is ever banned automatically.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Warn at claim #" name="warnAt" type="number" min={1} defaultValue={1} />
          <FormField label="Disqualify card at claim #" name="disqualifyCardAt" type="number" min={1} defaultValue={2} />
          <FormField label="Remove player at claim #" name="removePlayerAt" type="number" min={1} defaultValue={3} />
        </div>
      </div>

      <SubmitButton type="submit" loading={loading} className="w-auto px-6">
        Create game
      </SubmitButton>
    </form>
  );
}
