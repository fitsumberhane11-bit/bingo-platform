import { createHash, createHmac, randomBytes } from "node:crypto";
import { COLUMN_RANGES, type ColumnLetter } from "./card";

/** 32 bytes of CSPRNG randomness, hex-encoded — the game's secret seed. */
export function generateSecretSeed(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 of the seed — published BEFORE the game starts so the sequence can't be changed after the fact undetected. */
export function commitmentHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Deterministic, seed-derived byte stream (HMAC-SHA256 in counter mode).
 * Same seed always produces the same bytes, which is what makes the whole
 * scheme independently re-computable/verifiable after the seed is revealed
 * — a `Math.random()`-based or non-deterministic shuffle could not be
 * verified after the fact.
 */
function createSeededByteStream(seed: string) {
  let counter = 0;
  let buffer = Buffer.alloc(0);
  return function nextByte(): number {
    if (buffer.length === 0) {
      buffer = createHmac("sha256", seed).update(String(counter++)).digest();
    }
    const byte = buffer[0]!;
    buffer = buffer.subarray(1);
    return byte;
  };
}

/** Unbiased integer in [0, max) from the seeded stream, via rejection sampling. */
function seededNextInt(nextByte: () => number, max: number): number {
  if (max <= 0) throw new Error("max must be positive");
  const range = 256 - (256 % max);
  let value = nextByte();
  while (value >= range) value = nextByte();
  return value % max;
}

/**
 * Deterministically derives the full 75-number call order from the secret
 * seed via a seeded Fisher–Yates shuffle. Pure function of `seed` — this is
 * what a player (or anyone) re-runs after the seed is revealed to confirm
 * the actual call order matches what was committed to before the game
 * started.
 */
export function deriveCallSequence(seed: string): number[] {
  const nextByte = createSeededByteStream(seed);
  const arr = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = seededNextInt(nextByte, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function letterForBall(ball: number): ColumnLetter {
  for (const letter of Object.keys(COLUMN_RANGES) as ColumnLetter[]) {
    const [min, max] = COLUMN_RANGES[letter];
    if (ball >= min && ball <= max) return letter;
  }
  throw new Error(`Ball number ${ball} is out of the 1-75 range.`);
}

export interface FairnessVerification {
  commitmentValid: boolean;
  sequenceValid: boolean;
  recomputedCommitment: string;
  recomputedSequence: number[];
}

/**
 * Full independent verification: given the revealed seed, the originally
 * published commitment, and the sequence of numbers actually called,
 * confirms both that the seed matches the commitment AND that the actual
 * calls match what that seed deterministically produces.
 */
export function verifyFairness(seed: string, publishedCommitment: string, actualCalledSequence: number[]): FairnessVerification {
  const recomputedCommitment = commitmentHash(seed);
  const recomputedSequence = deriveCallSequence(seed);
  const commitmentValid = recomputedCommitment === publishedCommitment;
  const relevantSlice = recomputedSequence.slice(0, actualCalledSequence.length);
  const sequenceValid = JSON.stringify(relevantSlice) === JSON.stringify(actualCalledSequence);
  return { commitmentValid, sequenceValid, recomputedCommitment, recomputedSequence };
}
