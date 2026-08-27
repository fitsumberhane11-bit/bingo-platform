import type { PatternDefinition } from "./pattern";

function emptyMatrix(): number[][] {
  return Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
}

function diagonalMatrix(direction: "down" | "up"): number[][] {
  const m = emptyMatrix();
  for (let i = 0; i < 5; i++) {
    m[i]![direction === "down" ? i : 4 - i] = 1;
  }
  return m;
}

function fourCornersMatrix(): number[][] {
  const m = emptyMatrix();
  m[0]![0] = 1;
  m[0]![4] = 1;
  m[4]![0] = 1;
  m[4]![4] = 1;
  return m;
}

function xMatrix(): number[][] {
  const down = diagonalMatrix("down");
  const up = diagonalMatrix("up");
  return down.map((row, i) => row.map((v, j) => (v || up[i]![j] ? 1 : 0)));
}

function plusMatrix(): number[][] {
  const m = emptyMatrix();
  for (let i = 0; i < 5; i++) {
    m[2]![i] = 1; // middle row
    m[i]![2] = 1; // middle column
  }
  return m;
}

function fullHouseMatrix(): number[][] {
  return Array.from({ length: 5 }, () => [1, 1, 1, 1, 1]);
}

function rowMatrix(row: number): number[][] {
  const m = emptyMatrix();
  m[row] = [1, 1, 1, 1, 1];
  return m;
}

function columnsMatrix(cols: number[]): number[][] {
  const m = emptyMatrix();
  for (const row of m) for (const c of cols) row[c] = 1;
  return m;
}

/** Top two rows fully marked, plus the B/I cells of the middle row — 12 of the 24 required cells, exactly half a Full House. */
function halfHouseMatrix(): number[][] {
  const m = emptyMatrix();
  m[0] = [1, 1, 1, 1, 1];
  m[1] = [1, 1, 1, 1, 1];
  m[2]![0] = 1;
  m[2]![1] = 1;
  return m;
}

/** Full top row plus the full middle column — the classic "T" shape. */
function tMatrix(): number[][] {
  const m = rowMatrix(0);
  for (let i = 0; i < 5; i++) m[i]![2] = 1;
  return m;
}

/** A narrower T: the middle three cells of the top row (I/N/G) plus the full middle column. */
function smallTMatrix(): number[][] {
  const m = emptyMatrix();
  m[0]![1] = 1;
  m[0]![2] = 1;
  m[0]![3] = 1;
  for (let i = 0; i < 5; i++) m[i]![2] = 1;
  return m;
}

/** Columns B and O fully marked, plus the middle row — an H shape. */
function hMatrix(): number[][] {
  const m = columnsMatrix([0, 4]);
  m[2] = [1, 1, 1, 1, 1];
  return m;
}

/** Column B fully marked plus the bottom row — an L shape. */
function lMatrix(): number[][] {
  const m = columnsMatrix([0]);
  m[4] = [1, 1, 1, 1, 1];
  return m;
}

/** Columns B and O fully marked plus the bottom row — a U shape. */
function uMatrix(): number[][] {
  const m = columnsMatrix([0, 4]);
  m[4] = [1, 1, 1, 1, 1];
  return m;
}

/** A diamond: the four edge-midpoints plus the two cells flanking each. */
function diamondMatrix(): number[][] {
  const m = emptyMatrix();
  m[0]![2] = 1;
  m[1]![1] = 1;
  m[1]![3] = 1;
  m[2]![0] = 1;
  m[2]![4] = 1;
  m[3]![1] = 1;
  m[3]![3] = 1;
  m[4]![2] = 1;
  return m;
}

function fourCornersPlusCenterMatrix(): number[][] {
  const m = fourCornersMatrix();
  m[2]![2] = 1; // the FREE center — always trivially satisfied, kept for label fidelity
  return m;
}

function centerSquareMatrix(): number[][] {
  const m = emptyMatrix();
  m[2]![2] = 1;
  return m;
}

export interface PresetPattern {
  name: string;
  description: string;
  definition: PatternDefinition;
}

/**
 * Standard 75-ball patterns, seeded into `WinningPattern` at dev-seed time.
 * "Diagonal" is deliberately split into its two directions rather than one
 * ambiguous "diagonal" pattern — an admin picks whichever they mean, or
 * both, rather than the engine silently deciding "either counts."
 */
export const PRESET_PATTERNS: PresetPattern[] = [
  {
    name: "One Horizontal Line",
    description: "Any single row fully marked.",
    definition: { matchType: "ANY_ROWS", linesRequired: 1 },
  },
  {
    name: "Two Horizontal Lines",
    description: "Any two distinct rows fully marked.",
    definition: { matchType: "ANY_ROWS", linesRequired: 2 },
  },
  {
    name: "One Vertical Line",
    description: "Any single column (B, I, N, G, or O) fully marked.",
    definition: { matchType: "ANY_COLUMNS", linesRequired: 1 },
  },
  {
    name: "Two Vertical Lines",
    description: "Any two distinct columns fully marked.",
    definition: { matchType: "ANY_COLUMNS", linesRequired: 2 },
  },
  {
    name: "Diagonal (Top-Left to Bottom-Right)",
    description: "The B1-I2-FREE-G4-O5 diagonal.",
    definition: { matchType: "EXACT_MATCH", matrix: diagonalMatrix("down") },
  },
  {
    name: "Diagonal (Top-Right to Bottom-Left)",
    description: "The O1-G2-FREE-I4-B5 diagonal.",
    definition: { matchType: "EXACT_MATCH", matrix: diagonalMatrix("up") },
  },
  {
    name: "Four Corners",
    description: "The four corner cells of the card.",
    definition: { matchType: "EXACT_MATCH", matrix: fourCornersMatrix() },
  },
  {
    name: "X Pattern",
    description: "Both diagonals together, forming an X.",
    definition: { matchType: "EXACT_MATCH", matrix: xMatrix() },
  },
  {
    name: "Plus Pattern",
    description: "The middle row and middle column together, forming a +.",
    definition: { matchType: "EXACT_MATCH", matrix: plusMatrix() },
  },
  {
    name: "Full House (Blackout)",
    description: "Every cell on the card marked.",
    definition: { matchType: "EXACT_MATCH", matrix: fullHouseMatrix() },
  },

  // ------------------------------------------------------------------------
  // Extended rule set (Section 5) — the 10 presets above are untouched for
  // backward compatibility with existing games/tests; everything below is
  // additive. Named exactly per the requested 30-pattern list, minus "Four
  // Corners" (already present above, reused rather than duplicated) and
  // "Custom Pattern" (not a fixed shape — an operator paints a matrix at
  // game-creation time instead; see the admin rule-picker UI).
  // ------------------------------------------------------------------------
  {
    name: "Full House",
    description: "Every cell on the card marked. Same shape as Full House (Blackout), listed under both names.",
    definition: { matchType: "EXACT_MATCH", matrix: fullHouseMatrix() },
  },
  {
    name: "Half House",
    description: "The top two rows plus the B and I cells of the middle row — 12 of the 24 required cells.",
    definition: { matchType: "EXACT_MATCH", matrix: halfHouseMatrix() },
  },
  {
    name: "One Line",
    description: "Any single row fully marked.",
    definition: { matchType: "ANY_ROWS", linesRequired: 1 },
  },
  {
    name: "Two Lines",
    description: "Any two distinct rows fully marked.",
    definition: { matchType: "ANY_ROWS", linesRequired: 2 },
  },
  {
    name: "Three Lines",
    description: "Any three distinct rows fully marked.",
    definition: { matchType: "ANY_ROWS", linesRequired: 3 },
  },
  {
    name: "Four Lines",
    description: "Any four distinct rows fully marked.",
    definition: { matchType: "ANY_ROWS", linesRequired: 4 },
  },
  {
    name: "Five Lines",
    description: "All five rows fully marked — equivalent to Full House.",
    definition: { matchType: "ANY_ROWS", linesRequired: 5 },
  },
  {
    name: "Big T",
    description: "The full top row plus the full middle column.",
    definition: { matchType: "EXACT_MATCH", matrix: tMatrix() },
  },
  {
    name: "Small T",
    description: "The middle three cells of the top row (I, N, G) plus the full middle column.",
    definition: { matchType: "EXACT_MATCH", matrix: smallTMatrix() },
  },
  {
    name: "Cross",
    description: "The middle row and middle column together.",
    definition: { matchType: "EXACT_MATCH", matrix: plusMatrix() },
  },
  {
    name: "Top Line",
    description: "The full top row only.",
    definition: { matchType: "EXACT_MATCH", matrix: rowMatrix(0) },
  },
  {
    name: "Middle Line",
    description: "The full middle row only.",
    definition: { matchType: "EXACT_MATCH", matrix: rowMatrix(2) },
  },
  {
    name: "Bottom Line",
    description: "The full bottom row only.",
    definition: { matchType: "EXACT_MATCH", matrix: rowMatrix(4) },
  },
  {
    name: "Any Horizontal Line",
    description: "Any single complete row.",
    definition: { matchType: "ANY_ROWS", linesRequired: 1 },
  },
  {
    name: "Any Vertical Line",
    description: "Any single complete column (B, I, N, G, or O).",
    definition: { matchType: "ANY_COLUMNS", linesRequired: 1 },
  },
  {
    name: "Any Diagonal",
    description: "Either diagonal, fully marked.",
    definition: {
      matchType: "ANY_OF_SET",
      matrices: [diagonalMatrix("down"), diagonalMatrix("up")],
      matchesRequired: 1,
    },
  },
  {
    name: "Coverall",
    description: "Every playable cell covered — the same shape as Full House.",
    definition: { matchType: "EXACT_MATCH", matrix: fullHouseMatrix() },
  },
  {
    name: "Letter H",
    description: "Columns B and O fully marked, plus the middle row.",
    definition: { matchType: "EXACT_MATCH", matrix: hMatrix() },
  },
  {
    name: "Letter L",
    description: "Column B fully marked, plus the bottom row.",
    definition: { matchType: "EXACT_MATCH", matrix: lMatrix() },
  },
  {
    name: "Letter U",
    description: "Columns B and O fully marked, plus the bottom row.",
    definition: { matchType: "EXACT_MATCH", matrix: uMatrix() },
  },
  {
    name: "Letter T",
    description: "The full top row plus the full middle column. Same shape as Big T.",
    definition: { matchType: "EXACT_MATCH", matrix: tMatrix() },
  },
  {
    name: "Diamond",
    description: "A diamond shape formed by the cells surrounding the center.",
    definition: { matchType: "EXACT_MATCH", matrix: diamondMatrix() },
  },
  {
    name: "Four Corners + Center",
    description: "The four corner cells plus the center — the center is the FREE space, so this plays identically to Four Corners.",
    definition: { matchType: "EXACT_MATCH", matrix: fourCornersPlusCenterMatrix() },
  },
  {
    name: "Center Square",
    description: "Only the center cell. Since the center is the FREE space (always marked), this pattern is won the instant the game starts — a deliberate quirk of this shape, not a bug. Intended for demonstration, not real play.",
    definition: { matchType: "EXACT_MATCH", matrix: centerSquareMatrix() },
  },
  {
    name: "Early Five",
    description: "The first five of the card's own numbers to be called, in any position.",
    definition: { matchType: "COUNT_THRESHOLD", count: 5 },
  },
  {
    name: "Early Seven",
    description: "The first seven of the card's own numbers to be called, in any position.",
    definition: { matchType: "COUNT_THRESHOLD", count: 7 },
  },
  {
    name: "Early Ten",
    description: "The first ten of the card's own numbers to be called, in any position.",
    definition: { matchType: "COUNT_THRESHOLD", count: 10 },
  },
];
