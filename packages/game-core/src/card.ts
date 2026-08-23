import { randomInt } from "node:crypto";

export const COLUMN_LETTERS = ["B", "I", "N", "G", "O"] as const;
export type ColumnLetter = (typeof COLUMN_LETTERS)[number];

export const COLUMN_RANGES: Record<ColumnLetter, [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

/** Standard 75-ball Bingo card: 5 numbers per column, center of N is FREE (null). */
export interface BingoCard {
  B: number[];
  I: number[];
  N: (number | null)[];
  G: number[];
  O: number[];
}

/**
 * Fisher–Yates shuffle using a CSPRNG (`crypto.randomInt`, not `Math.random`)
 * — this is what makes card generation "secure randomness" rather than
 * merely "random enough to look right."
 */
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function pickColumn(letter: ColumnLetter, count: number): number[] {
  const [min, max] = COLUMN_RANGES[letter];
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return shuffle(pool)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/** Generates one cryptographically-random, structurally-valid 75-ball Bingo card. */
export function generateBingoCard(): BingoCard {
  const nColumn = pickColumn("N", 4);
  return {
    B: pickColumn("B", 5),
    I: pickColumn("I", 5),
    N: [nColumn[0]!, nColumn[1]!, null, nColumn[2]!, nColumn[3]!],
    G: pickColumn("G", 5),
    O: pickColumn("O", 5),
  };
}

/** Row-major 5x5 view of a card — grid[row][col], col order B,I,N,G,O — for pattern matching. */
export function cardToGrid(card: BingoCard): (number | null)[][] {
  return Array.from({ length: 5 }, (_, row) => COLUMN_LETTERS.map((letter) => card[letter][row] ?? null));
}

export interface CardValidationResult {
  valid: boolean;
  errors: string[];
}

/** Structural validator — used by tests and as a defensive check before persisting a card. */
export function validateBingoCard(card: BingoCard): CardValidationResult {
  const errors: string[] = [];

  for (const letter of COLUMN_LETTERS) {
    const column: (number | null)[] = card[letter];
    if (column.length !== 5) {
      errors.push(`Column ${letter} must have exactly 5 cells.`);
      continue;
    }
    const [min, max] = COLUMN_RANGES[letter];
    const numbers = column.filter((n): n is number => n !== null);
    if (letter === "N") {
      if (column[2] !== null) errors.push("Center cell (N, row 3) must be FREE.");
      if (numbers.length !== 4) errors.push("Column N must have exactly 4 numbers plus the FREE center.");
    } else {
      if (numbers.length !== 5) errors.push(`Column ${letter} must have exactly 5 numbers.`);
    }
    for (const n of numbers) {
      if (n < min || n > max) errors.push(`Column ${letter} contains ${n}, outside range ${min}-${max}.`);
    }
    if (new Set(numbers).size !== numbers.length) errors.push(`Column ${letter} contains a duplicate number.`);
  }

  return { valid: errors.length === 0, errors };
}
