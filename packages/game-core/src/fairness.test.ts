import { describe, expect, it } from "vitest";
import { commitmentHash, deriveCallSequence, generateSecretSeed, letterForBall, verifyFairness } from "./fairness";

describe("generateSecretSeed", () => {
  it("produces distinct 64-hex-char seeds", () => {
    const a = generateSecretSeed();
    const b = generateSecretSeed();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});

describe("commitmentHash", () => {
  it("is deterministic for the same seed", () => {
    const seed = generateSecretSeed();
    expect(commitmentHash(seed)).toBe(commitmentHash(seed));
  });

  it("changes if even one character of the seed changes", () => {
    const seed = "a".repeat(64);
    const tampered = "b" + "a".repeat(63);
    expect(commitmentHash(seed)).not.toBe(commitmentHash(tampered));
  });
});

describe("deriveCallSequence", () => {
  it("produces a permutation of 1..75 (every ball exactly once)", () => {
    const seed = generateSecretSeed();
    const sequence = deriveCallSequence(seed);
    expect(sequence).toHaveLength(75);
    expect(new Set(sequence).size).toBe(75);
    for (let n = 1; n <= 75; n++) expect(sequence).toContain(n);
  });

  it("is fully deterministic given the same seed", () => {
    const seed = generateSecretSeed();
    expect(deriveCallSequence(seed)).toEqual(deriveCallSequence(seed));
  });

  it("produces different sequences for different seeds", () => {
    const seqA = deriveCallSequence(generateSecretSeed());
    const seqB = deriveCallSequence(generateSecretSeed());
    expect(seqA).not.toEqual(seqB);
  });

  it("does not obviously correlate seed prefix with sequence prefix (sanity, not a full statistical test)", () => {
    const firstBalls = Array.from({ length: 50 }, () => deriveCallSequence(generateSecretSeed())[0]);
    expect(new Set(firstBalls).size).toBeGreaterThan(10);
  });
});

describe("letterForBall", () => {
  it("maps ranges to the correct letter", () => {
    expect(letterForBall(1)).toBe("B");
    expect(letterForBall(15)).toBe("B");
    expect(letterForBall(16)).toBe("I");
    expect(letterForBall(30)).toBe("I");
    expect(letterForBall(31)).toBe("N");
    expect(letterForBall(45)).toBe("N");
    expect(letterForBall(46)).toBe("G");
    expect(letterForBall(60)).toBe("G");
    expect(letterForBall(61)).toBe("O");
    expect(letterForBall(75)).toBe("O");
  });

  it("rejects out-of-range balls", () => {
    expect(() => letterForBall(0)).toThrow();
    expect(() => letterForBall(76)).toThrow();
  });
});

describe("verifyFairness — the full commit/reveal/verify roundtrip", () => {
  it("confirms a genuine game: seed matches commitment and calls match the derived sequence", () => {
    const seed = generateSecretSeed();
    const commitment = commitmentHash(seed);
    const fullSequence = deriveCallSequence(seed);
    const actualCalls = fullSequence.slice(0, 20); // game ended after 20 calls

    const result = verifyFairness(seed, commitment, actualCalls);
    expect(result.commitmentValid).toBe(true);
    expect(result.sequenceValid).toBe(true);
  });

  it("detects a wrong seed (doesn't match the published commitment)", () => {
    const seed = generateSecretSeed();
    const commitment = commitmentHash(seed);
    const wrongSeed = generateSecretSeed();

    const result = verifyFairness(wrongSeed, commitment, []);
    expect(result.commitmentValid).toBe(false);
  });

  it("detects a manipulated call sequence even if the seed/commitment are genuine", () => {
    const seed = generateSecretSeed();
    const commitment = commitmentHash(seed);
    const fullSequence = deriveCallSequence(seed);
    const tamperedCalls = [...fullSequence.slice(0, 19), 999]; // last call swapped for a bogus value

    const result = verifyFairness(seed, commitment, tamperedCalls);
    expect(result.commitmentValid).toBe(true);
    expect(result.sequenceValid).toBe(false);
  });

  it("detects calls that are out of the committed order (reordering, not just substitution)", () => {
    const seed = generateSecretSeed();
    const commitment = commitmentHash(seed);
    const fullSequence = deriveCallSequence(seed);
    const reordered = [...fullSequence.slice(0, 10)].reverse();

    const result = verifyFairness(seed, commitment, reordered);
    expect(result.sequenceValid).toBe(false);
  });
});
