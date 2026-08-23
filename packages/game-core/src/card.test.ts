import { describe, expect, it } from "vitest";
import { COLUMN_LETTERS, COLUMN_RANGES, cardToGrid, generateBingoCard, validateBingoCard } from "./card";

describe("generateBingoCard", () => {
  it("produces a structurally valid card", () => {
    const card = generateBingoCard();
    expect(validateBingoCard(card).valid).toBe(true);
  });

  it("has the FREE center at N[2]", () => {
    const card = generateBingoCard();
    expect(card.N[2]).toBeNull();
  });

  it("keeps every column within its correct range", () => {
    const card = generateBingoCard();
    for (const letter of COLUMN_LETTERS) {
      const [min, max] = COLUMN_RANGES[letter];
      for (const n of card[letter]) {
        if (n === null) continue;
        expect(n).toBeGreaterThanOrEqual(min);
        expect(n).toBeLessThanOrEqual(max);
      }
    }
  });

  it("never duplicates a number within a column", () => {
    const card = generateBingoCard();
    for (const letter of COLUMN_LETTERS) {
      const numbers = card[letter].filter((n): n is number => n !== null);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it("produces a valid card across 1,000 generations (no flaky randomness)", () => {
    for (let i = 0; i < 1000; i++) {
      const card = generateBingoCard();
      const result = validateBingoCard(card);
      if (!result.valid) throw new Error(`Card #${i} invalid: ${result.errors.join(", ")}`);
    }
  });

  it("generates non-identical cards (not a predictable/fixed pattern)", () => {
    const cards = Array.from({ length: 100 }, () => JSON.stringify(generateBingoCard()));
    // With true randomness, 100 cards drawn from a huge combinatorial space
    // should essentially never collide.
    expect(new Set(cards).size).toBe(100);
  });

  it("does not correlate column order across many cards (basic randomness sanity check)", () => {
    // First B-column number should not always land in the same relative
    // position/bucket — a crude signal that shuffling, not a fixed
    // transform, is happening.
    const firstBValues = Array.from({ length: 200 }, () => generateBingoCard().B[0]!);
    const distinctValues = new Set(firstBValues);
    expect(distinctValues.size).toBeGreaterThan(5);
  });
});

describe("cardToGrid", () => {
  it("maps columns to a row-major 5x5 grid in B,I,N,G,O column order", () => {
    const card = generateBingoCard();
    const grid = cardToGrid(card);
    expect(grid).toHaveLength(5);
    for (const row of grid) expect(row).toHaveLength(5);
    expect(grid[2]![2]).toBeNull(); // FREE center
    expect(grid[0]![0]).toBe(card.B[0]);
    expect(grid[4]![4]).toBe(card.O[4]);
  });
});

describe("validateBingoCard", () => {
  it("rejects a card with an out-of-range number", () => {
    const card = generateBingoCard();
    card.B[0] = 99;
    expect(validateBingoCard(card).valid).toBe(false);
  });

  it("rejects a card with a duplicate number in a column", () => {
    const card = generateBingoCard();
    card.G[1] = card.G[0]!;
    expect(validateBingoCard(card).valid).toBe(false);
  });

  it("rejects a card whose FREE center was tampered into a number", () => {
    const card = generateBingoCard();
    card.N[2] = 40;
    expect(validateBingoCard(card).valid).toBe(false);
  });
});
