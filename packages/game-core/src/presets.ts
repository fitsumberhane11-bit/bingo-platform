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
];
