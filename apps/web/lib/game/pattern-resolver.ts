import type { WinningPattern } from "@bingo/db";
import type { PatternDefinition, PatternMatrix } from "@bingo/game-core";

interface StoredPatternConfig {
  linesRequired?: number;
  matrices?: PatternMatrix[];
  matchesRequired?: number;
  count?: number;
}

/** Converts a persisted `WinningPattern` row back into the shape `evaluatePattern()` expects. Single source of truth — every claim-validation and legacy-sweep path must go through this, never re-derive it ad hoc. */
export function toPatternDefinition(pattern: WinningPattern): PatternDefinition {
  const config = (pattern.config as StoredPatternConfig | null) ?? {};
  return {
    matchType: pattern.matchType,
    matrix: (pattern.matrix as PatternMatrix | null) ?? undefined,
    linesRequired: config.linesRequired,
    matrices: config.matrices,
    matchesRequired: config.matchesRequired,
    count: config.count,
  };
}
