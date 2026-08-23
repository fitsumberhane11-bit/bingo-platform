"use client";

const STORAGE_KEY = "bingo:sound-settings:v1";

export interface SoundSettings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
}

const DEFAULTS: SoundSettings = { sound: true, music: true, vibration: true };

let cached: SoundSettings | null = null;
const listeners = new Set<(s: SoundSettings) => void>();

export function getSoundSettings(): SoundSettings {
  if (cached) return cached;
  if (typeof window === "undefined") return DEFAULTS;
  let resolved: SoundSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    resolved = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    resolved = { ...DEFAULTS };
  }
  cached = resolved;
  return resolved;
}

export function setSoundSettings(partial: Partial<SoundSettings>): SoundSettings {
  const next = { ...getSoundSettings(), ...partial };
  cached = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable (private browsing, etc.) — preference just won't persist across reloads */
    }
  }
  for (const l of listeners) l(next);
  return next;
}

export function subscribeSoundSettings(listener: (s: SoundSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
