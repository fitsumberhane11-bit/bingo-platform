import { describe, expect, it } from "vitest";
import type { BingoCard } from "./card";
import { evaluatePattern } from "./pattern";
import { PRESET_PATTERNS } from "./presets";

// A fixed, known card makes pattern math easy to reason about by hand.
const CARD: BingoCard = {
  B: [1, 2, 3, 4, 5],
  I: [16, 17, 18, 19, 20],
  N: [31, 32, null, 34, 35],
  G: [46, 47, 48, 49, 50],
  O: [61, 62, 63, 64, 65],
};

function findPreset(name: string) {
  const preset = PRESET_PATTERNS.find((p) => p.name === name);
  if (!preset) throw new Error(`Missing preset: ${name}`);
  return preset.definition;
}

describe("evaluatePattern — ANY_ROWS", () => {
  const pattern = findPreset("One Horizontal Line");

  it("wins when row 0 (B1,I16,N31,G46,O61) is fully called", () => {
    const calledSet = new Set([1, 16, 31, 46, 61]);
    const result = evaluatePattern(CARD, calledSet, pattern);
    expect(result.won).toBe(true);
    expect(result.winningPositions).toHaveLength(5);
  });

  it("wins when the FREE row (row 2) needs only its 4 real numbers called", () => {
    const calledSet = new Set([3, 18, 48, 63]); // row 2 real numbers; N is FREE
    const result = evaluatePattern(CARD, calledSet, pattern);
    expect(result.won).toBe(true);
  });

  it("does not win with a partially-called row", () => {
    const calledSet = new Set([1, 16, 31, 46]); // missing O61
    expect(evaluatePattern(CARD, calledSet, pattern).won).toBe(false);
  });

  it("Two Horizontal Lines requires two distinct complete rows", () => {
    const twoLines = findPreset("Two Horizontal Lines");
    const oneRowOnly = new Set([1, 16, 31, 46, 61]);
    expect(evaluatePattern(CARD, oneRowOnly, twoLines).won).toBe(false);

    const twoRows = new Set([1, 16, 31, 46, 61, 2, 17, 32, 47, 62]);
    expect(evaluatePattern(CARD, twoRows, twoLines).won).toBe(true);
  });
});

describe("evaluatePattern — ANY_COLUMNS", () => {
  it("One Vertical Line wins when a full column is called", () => {
    const pattern = findPreset("One Vertical Line");
    const bColumn = new Set([1, 2, 3, 4, 5]);
    expect(evaluatePattern(CARD, bColumn, pattern).won).toBe(true);
  });

  it("Two Vertical Lines requires two distinct complete columns", () => {
    const pattern = findPreset("Two Vertical Lines");
    const bOnly = new Set([1, 2, 3, 4, 5]);
    expect(evaluatePattern(CARD, bOnly, pattern).won).toBe(false);

    const bAndI = new Set([1, 2, 3, 4, 5, 16, 17, 18, 19, 20]);
    expect(evaluatePattern(CARD, bAndI, pattern).won).toBe(true);
  });
});

describe("evaluatePattern — EXACT_MATCH shapes", () => {
  it("Four Corners wins with only the 4 corners called", () => {
    const pattern = findPreset("Four Corners");
    const corners = new Set([1, 61, 5, 65]); // B1, O1, B5, O5
    expect(evaluatePattern(CARD, corners, pattern).won).toBe(true);
    expect(evaluatePattern(CARD, new Set([1, 61, 5]), pattern).won).toBe(false);
  });

  it("Diagonal (TL-BR) wins along B1, I17, FREE, G49, O65", () => {
    const pattern = findPreset("Diagonal (Top-Left to Bottom-Right)");
    const diag = new Set([1, 17, 49, 65]); // N is FREE
    expect(evaluatePattern(CARD, diag, pattern).won).toBe(true);
  });

  it("Diagonal (TR-BL) wins along O1, G17(row1), FREE, I34(row3), B5", () => {
    const pattern = findPreset("Diagonal (Top-Right to Bottom-Left)");
    const diag = new Set([61, 47, 19, 5]);
    expect(evaluatePattern(CARD, diag, pattern).won).toBe(true);
  });

  it("X Pattern requires both diagonals", () => {
    const pattern = findPreset("X Pattern");
    const oneDiagOnly = new Set([1, 17, 49, 65]);
    expect(evaluatePattern(CARD, oneDiagOnly, pattern).won).toBe(false);

    const bothDiags = new Set([1, 17, 49, 65, 61, 47, 19, 5]);
    expect(evaluatePattern(CARD, bothDiags, pattern).won).toBe(true);
  });

  it("Plus Pattern requires the middle row and middle column", () => {
    const pattern = findPreset("Plus Pattern");
    const middleRow = new Set([3, 18, 48, 63]);
    expect(evaluatePattern(CARD, middleRow, pattern).won).toBe(false);

    const middleColumn = new Set([31, 32, 34, 35]); // N column (minus FREE)
    const both = new Set([...middleRow, ...middleColumn]);
    expect(evaluatePattern(CARD, both, pattern).won).toBe(true);
  });

  it("Full House requires every non-FREE cell called", () => {
    const pattern = findPreset("Full House (Blackout)");
    const all = new Set([1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 31, 32, 34, 35, 46, 47, 48, 49, 50, 61, 62, 63, 64, 65]);
    expect(evaluatePattern(CARD, all, pattern).won).toBe(true);

    const missingOne = new Set([...all]);
    missingOne.delete(65);
    expect(evaluatePattern(CARD, missingOne, pattern).won).toBe(false);
  });

  it("reports the exact winning cell numbers, not just a boolean", () => {
    const pattern = findPreset("Four Corners");
    const corners = new Set([1, 61, 5, 65]);
    const result = evaluatePattern(CARD, corners, pattern);
    const numbers = result.winningPositions.map((p) => p.number).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(numbers).toEqual([1, 5, 61, 65]);
  });
});

describe("evaluatePattern — ANY_OF_SET", () => {
  it("Any Diagonal wins with just one diagonal, not requiring both", () => {
    const pattern = findPreset("Any Diagonal");
    const trBl = new Set([61, 47, 19, 5]); // O1, G17, I34, B5 — the TR-BL diagonal
    expect(evaluatePattern(CARD, trBl, pattern).won).toBe(true);

    const tlBr = new Set([1, 17, 49, 65]); // the other diagonal
    expect(evaluatePattern(CARD, tlBr, pattern).won).toBe(true);
  });

  it("Any Diagonal does not win on an unrelated set of calls", () => {
    const pattern = findPreset("Any Diagonal");
    expect(evaluatePattern(CARD, new Set([1, 2, 3, 4]), pattern).won).toBe(false);
  });
});

describe("evaluatePattern — COUNT_THRESHOLD", () => {
  it("Early Five wins once 5 of the card's own numbers are called, in any position", () => {
    const pattern = findPreset("Early Five");
    const four = new Set([1, 16, 46, 61]);
    expect(evaluatePattern(CARD, four, pattern).won).toBe(false);

    const five = new Set([1, 16, 46, 61, 62]); // scattered, not a line or shape
    expect(evaluatePattern(CARD, five, pattern).won).toBe(true);
  });

  it("Early Ten requires strictly more calls than Early Five", () => {
    const five = findPreset("Early Five");
    const ten = findPreset("Early Ten");
    const nineCalled = new Set([1, 2, 3, 4, 16, 17, 18, 46, 47]);
    expect(evaluatePattern(CARD, nineCalled, five).won).toBe(true);
    expect(evaluatePattern(CARD, nineCalled, ten).won).toBe(false);
  });

  it("does not count numbers that are not on this card", () => {
    const pattern = findPreset("Early Five");
    const notOnCard = new Set([6, 7, 8, 9, 10]);
    expect(evaluatePattern(CARD, notOnCard, pattern).won).toBe(false);
  });
});

describe("all preset patterns are structurally valid", () => {
  it.each(PRESET_PATTERNS.map((p) => [p.name, p.definition] as const))("%s never throws when evaluated against an empty called set", (_name, definition) => {
    expect(() => evaluatePattern(CARD, new Set(), definition)).not.toThrow();
  });
});
