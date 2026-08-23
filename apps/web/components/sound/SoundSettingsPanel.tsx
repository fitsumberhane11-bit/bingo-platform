"use client";

import { useEffect, useState } from "react";
import { Volume2, Music, Smartphone } from "lucide-react";
import { getSoundSettings, setSoundSettings, subscribeSoundSettings, type SoundSettings } from "@/lib/sound/settings";
import { playSound, unlockAudio } from "@/lib/sound";

const OPTIONS: Array<{ key: keyof SoundSettings; label: string; description: string; icon: typeof Volume2 }> = [
  { key: "sound", label: "Sound effects", description: "Number calls, wins, alerts, and confirmations.", icon: Volume2 },
  { key: "music", label: "Background music", description: "Ambient music during live games.", icon: Music },
  { key: "vibration", label: "Vibration", description: "Haptic feedback on supported devices.", icon: Smartphone },
];

export function SoundSettingsPanel() {
  const [settings, setSettings] = useState<SoundSettings>(getSoundSettings());

  useEffect(() => subscribeSoundSettings(setSettings), []);

  function toggle(key: keyof SoundSettings) {
    unlockAudio();
    const next = setSoundSettings({ [key]: !settings[key] });
    if (key === "sound" && next.sound) playSound("ticketPurchase");
  }

  return (
    <div className="card space-y-1">
      <h2 className="mb-2 font-semibold text-ink-900">Sound &amp; vibration</h2>
      {OPTIONS.map(({ key, label, description, icon: Icon }) => (
        <div key={key} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink-900">{label}</p>
              <p className="text-xs text-slate-400">{description}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings[key]}
            aria-label={label}
            onClick={() => toggle(key)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${settings[key] ? "bg-brand-600" : "bg-slate-200"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings[key] ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
