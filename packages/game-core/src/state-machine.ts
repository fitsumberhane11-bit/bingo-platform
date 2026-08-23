export const GAME_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "FULL",
  "STARTING",
  "LIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type GameStatus = (typeof GAME_STATUSES)[number];

/**
 * The complete, explicit transition table. If a `from -> to` pair isn't
 * listed here, it is impossible — this is enforced by `canTransition`, not
 * left to callers to remember. `LIVE -> CANCELLED` is a distinct "emergency
 * cancellation" (see game-engine.ts), not the same code path as a normal
 * pre-start cancellation, even though both land on the same terminal state.
 */
const TRANSITIONS: Record<GameStatus, GameStatus[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["OPEN", "CANCELLED"],
  OPEN: ["FULL", "STARTING", "CANCELLED"],
  FULL: ["OPEN", "STARTING", "CANCELLED"],
  STARTING: ["LIVE", "CANCELLED"],
  LIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["LIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: GameStatus, to: GameStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidGameTransitionError extends Error {
  constructor(public from: GameStatus, public to: GameStatus) {
    super(`Cannot transition game from ${from} to ${to}.`);
    this.name = "InvalidGameTransitionError";
  }
}

export function assertValidTransition(from: GameStatus, to: GameStatus): void {
  if (!canTransition(from, to)) throw new InvalidGameTransitionError(from, to);
}

export function allowedNextStatuses(from: GameStatus): GameStatus[] {
  return [...TRANSITIONS[from]];
}
