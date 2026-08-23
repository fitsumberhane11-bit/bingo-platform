import { type BingoCard, cardToGrid } from "./card";

/** 5x5 matrix of 0/1, row-major, columns in B/I/N/G/O order. 1 = must be marked to win. */
export type PatternMatrix = number[][];

export type PatternMatchType = "EXACT_MATCH" | "ANY_ROWS" | "ANY_COLUMNS";

export interface PatternDefinition {
  matchType: PatternMatchType;
  /** Required for EXACT_MATCH; ignored otherwise. */
  matrix?: PatternMatrix;
  /** Required for ANY_ROWS/ANY_COLUMNS: how many distinct rows/columns must be fully marked. */
  linesRequired?: number;
}

export interface WinningPosition {
  row: number;
  col: number;
  letter: string;
  number: number | null; // null for the FREE center
}

export interface PatternEvaluation {
  won: boolean;
  /** The exact cells that satisfy the pattern — omitted (empty) when `won` is false. */
  winningPositions: WinningPosition[];
}

const LETTERS = ["B", "I", "N", "G", "O"];

function isMarked(value: number | null, calledSet: ReadonlySet<number>): boolean {
  return value === null || calledSet.has(value); // FREE is always marked
}

/**
 * The single, generic pattern evaluator — every winning shape (lines, four
 * corners, X, plus, diagonals, full house, or a fully custom admin-drawn
 * matrix) goes through this one function. Nothing about "what counts as a
 * win" is hard-coded outside the `PatternDefinition` data.
 */
export function evaluatePattern(card: BingoCard, calledSet: ReadonlySet<number>, pattern: PatternDefinition): PatternEvaluation {
  const grid = cardToGrid(card);

  if (pattern.matchType === "EXACT_MATCH") {
    if (!pattern.matrix) throw new Error("EXACT_MATCH pattern requires a matrix.");
    return evaluateExactMatch(grid, calledSet, pattern.matrix);
  }

  if (pattern.matchType === "ANY_ROWS") {
    return evaluateAnyLines(grid, calledSet, "row", pattern.linesRequired ?? 1);
  }

  return evaluateAnyLines(grid, calledSet, "col", pattern.linesRequired ?? 1);
}

function evaluateExactMatch(grid: (number | null)[][], calledSet: ReadonlySet<number>, matrix: PatternMatrix): PatternEvaluation {
  const positions: WinningPosition[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (matrix[row]?.[col] !== 1) continue;
      const value = grid[row]![col]!;
      if (!isMarked(value, calledSet)) return { won: false, winningPositions: [] };
      positions.push({ row, col, letter: LETTERS[col]!, number: value });
    }
  }
  return { won: positions.length > 0, winningPositions: positions };
}

function evaluateAnyLines(
  grid: (number | null)[][],
  calledSet: ReadonlySet<number>,
  axis: "row" | "col",
  linesRequired: number,
): PatternEvaluation {
  const completeLines: WinningPosition[][] = [];

  for (let i = 0; i < 5; i++) {
    const cells: WinningPosition[] = [];
    let complete = true;
    for (let j = 0; j < 5; j++) {
      const row = axis === "row" ? i : j;
      const col = axis === "row" ? j : i;
      const value = grid[row]![col]!;
      if (!isMarked(value, calledSet)) {
        complete = false;
        break;
      }
      cells.push({ row, col, letter: LETTERS[col]!, number: value });
    }
    if (complete) completeLines.push(cells);
  }

  if (completeLines.length < linesRequired) return { won: false, winningPositions: [] };

  return { won: true, winningPositions: completeLines.slice(0, linesRequired).flat() };
}
