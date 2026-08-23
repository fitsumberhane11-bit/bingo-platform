"use client";

import { SOUND_EVENTS, unlockAudio, type SoundEventName } from "./synth";
import { getSoundSettings } from "./settings";

export { unlockAudio };
export { getSoundSettings, setSoundSettings, subscribeSoundSettings, type SoundSettings } from "./settings";
export type { SoundEventName } from "./synth";

/** Plays a named event sound, respecting the player's Sound setting. Never throws, never mandatory. */
export function playSound(event: SoundEventName): void {
  if (!getSoundSettings().sound) return;
  try {
    SOUND_EVENTS[event]();
  } catch {
    /* audio can fail silently (autoplay policy, unsupported browser) — never block gameplay on it */
  }
}

/** Vibrates (mobile only), respecting the player's Vibration setting. Never throws, never mandatory. */
export function vibrate(pattern: number | number[] = 40): void {
  if (!getSoundSettings().vibration) return;
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
