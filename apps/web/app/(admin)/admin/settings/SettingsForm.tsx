"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, ApiClientError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";

interface Setting {
  key: string;
  label: string;
  description: string;
  type: "string" | "number" | "boolean";
  group: string;
  value: string | number | boolean | null;
}

export function SettingsForm({ settings }: { settings: Setting[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value ?? (s.type === "boolean" ? false : s.type === "number" ? 0 : "")])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const groups = Array.from(new Set(settings.map((s) => s.group)));

  async function save(setting: Setting) {
    setSaving(setting.key);
    setError(null);
    setSavedKey(null);
    try {
      const value = setting.type === "number" ? Number(values[setting.key]) : values[setting.key];
      await apiPatch("/api/admin/settings", { key: setting.key, value });
      setSavedKey(setting.key);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save setting.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {groups.map((group) => (
        <div key={group} className="card">
          <h2 className="mb-4 font-semibold text-ink-900">{group}</h2>
          <div className="space-y-4">
            {settings
              .filter((s) => s.group === group)
              .map((s) => (
                <div key={s.key} className="flex flex-col gap-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={s.key} className="text-sm font-medium text-ink-900">
                      {s.label}
                    </label>
                    <p className="text-xs text-slate-400">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.type === "boolean" ? (
                      <button
                        type="button"
                        id={s.key}
                        role="switch"
                        aria-checked={!!values[s.key]}
                        onClick={() => setValues((v) => ({ ...v, [s.key]: !v[s.key] }))}
                        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${values[s.key] ? "bg-brand-600" : "bg-slate-200"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${values[s.key] ? "translate-x-5" : "translate-x-0.5"}`}
                        />
                      </button>
                    ) : (
                      <input
                        id={s.key}
                        type={s.type === "number" ? "number" : "text"}
                        className="input w-40"
                        value={values[s.key] as string | number}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                      />
                    )}
                    <button className="btn-secondary px-3 py-1.5 text-xs" disabled={saving === s.key} onClick={() => save(s)}>
                      {saving === s.key ? "Saving…" : savedKey === s.key ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
