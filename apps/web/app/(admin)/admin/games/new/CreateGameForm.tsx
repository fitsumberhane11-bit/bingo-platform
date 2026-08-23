"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

interface Option {
  id: string;
  name: string;
  description?: string | null;
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateGameForm({ patterns, prizeRules }: { patterns: Option[]; prizeRules: Option[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 15 * 60 * 1000);
  const defaultRegClose = new Date(now.getTime() + 14 * 60 * 1000);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    const form = new FormData(e.currentTarget);

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
      manualMarkEnabled: form.get("cardMarking") === "MANUAL",
      winningPatternId: String(form.get("winningPatternId")),
      prizeRuleId: String(form.get("prizeRuleId")),
    };

    try {
      const res = await apiPost<{ game: { id: string } }>("/api/admin/games", payload);
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
        />
        <FormField
          label="Registration closes"
          name="registrationCloseAt"
          type="datetime-local"
          defaultValue={toLocalInputValue(defaultRegClose)}
          required
        />
        <FormField label="Start time" name="startTime" type="datetime-local" defaultValue={toLocalInputValue(defaultStart)} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Ticket price (ETB)" name="ticketPrice" type="number" min={1} step="0.01" defaultValue={10} required />
        <FormField label="Max players" name="maxPlayers" type="number" min={2} defaultValue={100} required />
        <FormField label="Max tickets / player" name="maxTicketsPerPlayer" type="number" min={1} defaultValue={5} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Min players to start" name="minPlayers" type="number" min={1} defaultValue={2} required />
        <FormField label="Jackpot (ETB, optional)" name="jackpotAmount" type="number" min={0} step="0.01" defaultValue={0} />
        <FormField label="Ball call interval (seconds)" name="callIntervalSeconds" type="number" min={3} max={120} defaultValue={8} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="callMode">
            Game mode
          </label>
          <select id="callMode" name="callMode" className="input" defaultValue="AUTOMATIC">
            <option value="AUTO">Automatic (server calls on a timer)</option>
            <option value="MANUAL">Controlled (operator triggers each call)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="winningPatternId">
            Winning pattern
          </label>
          <select id="winningPatternId" name="winningPatternId" className="input" required>
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="cardMarking">
            Card marking
          </label>
          <select id="cardMarking" name="cardMarking" className="input" defaultValue="AUTO">
            <option value="AUTO">Auto-mark (called numbers highlight automatically)</option>
            <option value="MANUAL">Manual-mark (players tap each called number)</option>
          </select>
        </div>
      </div>

      <SubmitButton type="submit" loading={loading} className="w-auto px-6">
        Create game
      </SubmitButton>
    </form>
  );
}
