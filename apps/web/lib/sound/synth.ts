"use client";

/**
 * A tiny original Web Audio synthesizer — every "sound" here is a
 * generated tone/envelope, not a sample file. This sidesteps any question
 * of audio licensing entirely and keeps the bundle free of binary assets.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!ctx) ctx = new AudioContextCtor();
  return ctx;
}

/** Must be called from within a user-gesture event handler — browsers block audio otherwise. */
export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {
      /* ignore — will retry unlocking on the next gesture */
    });
  }
}

interface Tone {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: Tone[]) {
  const c = getContext();
  if (!c || c.state !== "running") return;
  const now = c.currentTime;
  for (const t of tones) {
    const osc = c.createOscillator();
    const gainNode = c.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.value = t.freq;
    const peak = t.gain ?? 0.15;
    const startAt = now + t.start;
    const endAt = startAt + t.duration;
    gainNode.gain.setValueAtTime(0, startAt);
    gainNode.gain.linearRampToValueAtTime(peak, startAt + Math.min(0.02, t.duration / 4));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.connect(gainNode);
    gainNode.connect(c.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

export const SOUND_EVENTS = {
  numberCalled: () => playTones([{ freq: 660, start: 0, duration: 0.12, type: "triangle" }]),
  countdownTick: () => playTones([{ freq: 440, start: 0, duration: 0.08, type: "square", gain: 0.1 }]),
  gameStart: () =>
    playTones([
      { freq: 523.25, start: 0, duration: 0.12 },
      { freq: 659.25, start: 0.12, duration: 0.12 },
      { freq: 783.99, start: 0.24, duration: 0.2 },
    ]),
  winner: () =>
    playTones([
      { freq: 523.25, start: 0, duration: 0.15 },
      { freq: 659.25, start: 0.13, duration: 0.15 },
      { freq: 783.99, start: 0.26, duration: 0.15 },
      { freq: 1046.5, start: 0.39, duration: 0.35, gain: 0.18 },
    ]),
  announcement: () =>
    playTones([
      { freq: 880, start: 0, duration: 0.1, gain: 0.12 },
      { freq: 1108.73, start: 0.1, duration: 0.15, gain: 0.12 },
    ]),
  error: () => playTones([{ freq: 220, start: 0, duration: 0.25, type: "sawtooth", gain: 0.12 }]),
  ticketPurchase: () =>
    playTones([
      { freq: 587.33, start: 0, duration: 0.09 },
      { freq: 880, start: 0.09, duration: 0.15 },
    ]),
} as const;

export type SoundEventName = keyof typeof SOUND_EVENTS;
