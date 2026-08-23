import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { commitmentHash, deriveCallSequence, generateSecretSeed } from "./fairness";

/**
 * Independently re-implements the provably-fair commitment scheme from
 * scratch, using only Node's `crypto` primitives — no import of, or
 * delegation to, `commitmentHash()` / `deriveCallSequence()` /
 * `verifyFairness()` from ./fairness.ts. The point: if fairness.ts had a
 * bug (e.g. a biased shuffle, or a byte stream that wasn't actually
 * deterministic), a test that calls fairness.ts's own functions to check
 * fairness.ts's own output would never catch it — both sides of the
 * assertion would share the bug. This file is written purely from the
 * documented algorithm (SHA-256 commitment; HMAC-SHA256 counter-mode byte
 * stream feeding a rejection-sampled Fisher–Yates shuffle over 1..75),
 * not from reading fairness.ts's source.
 */

function independentCommitmentHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

function independentDeriveCallSequence(seed: string): number[] {
  let counter = 0;
  let buffer: Buffer = Buffer.alloc(0);
  let bufferPos = 0;

  function nextByte(): number {
    if (bufferPos >= buffer.length) {
      buffer = createHmac("sha256", seed).update(String(counter)).digest();
      counter += 1;
      bufferPos = 0;
    }
    return buffer[bufferPos++]!;
  }

  function nextInt(max: number): number {
    const range = 256 - (256 % max);
    let value = nextByte();
    while (value >= range) value = nextByte();
    return value % max;
  }

  const balls = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = nextInt(i + 1);
    const tmp = balls[i]!;
    balls[i] = balls[j]!;
    balls[j] = tmp;
  }
  return balls;
}

describe("independent re-implementation matches the game engine's fairness primitives", () => {
  it("commitment hash matches for 50 random seeds", () => {
    for (let i = 0; i < 50; i++) {
      const seed = generateSecretSeed();
      expect(independentCommitmentHash(seed)).toBe(commitmentHash(seed));
    }
  });

  it("call sequence matches for 50 random seeds", () => {
    for (let i = 0; i < 50; i++) {
      const seed = generateSecretSeed();
      expect(independentDeriveCallSequence(seed)).toEqual(deriveCallSequence(seed));
    }
  });

  it("independently confirms the sequence is a true permutation of 1..75 for every ball, every seed", () => {
    for (let i = 0; i < 20; i++) {
      const seed = generateSecretSeed();
      const sequence = independentDeriveCallSequence(seed);
      expect(sequence).toHaveLength(75);
      expect(new Set(sequence).size).toBe(75);
      expect(Math.min(...sequence)).toBe(1);
      expect(Math.max(...sequence)).toBe(75);
    }
  });

  it("end-to-end: independently verifies a full commit -> reveal -> replay cycle with no shared code path", () => {
    const seed = generateSecretSeed();
    const publishedCommitment = independentCommitmentHash(seed); // what would have been published pre-game
    const fullSequence = independentDeriveCallSequence(seed);
    const actualCalledSoFar = fullSequence.slice(0, 30); // simulates 30 balls having been called

    // A verifier who only has the seed (revealed post-game) and the
    // publicly-committed hash + the actually-called numbers can confirm
    // both independently, with zero dependency on the engine's own code.
    expect(independentCommitmentHash(seed)).toBe(publishedCommitment);
    expect(independentDeriveCallSequence(seed).slice(0, actualCalledSoFar.length)).toEqual(actualCalledSoFar);

    // And it must also equal what the actual engine module produces, for
    // this exact seed — proving the engine's real behavior (not just this
    // test's own re-implementation) is what the independent check verified.
    expect(commitmentHash(seed)).toBe(publishedCommitment);
    expect(deriveCallSequence(seed).slice(0, actualCalledSoFar.length)).toEqual(actualCalledSoFar);
  });

  it("detects a tampered/mismatched seed the same way a real auditor would", () => {
    const realSeed = generateSecretSeed();
    const publishedCommitment = independentCommitmentHash(realSeed);
    const wrongSeed = generateSecretSeed();

    expect(independentCommitmentHash(wrongSeed)).not.toBe(publishedCommitment);
  });
});
