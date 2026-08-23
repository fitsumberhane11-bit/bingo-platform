import { describe, expect, it } from "vitest";
import { GAME_STATUSES, InvalidGameTransitionError, assertValidTransition, canTransition } from "./state-machine";

const VALID_PAIRS = new Set([
  "DRAFT->SCHEDULED",
  "DRAFT->CANCELLED",
  "SCHEDULED->OPEN",
  "SCHEDULED->CANCELLED",
  "OPEN->FULL",
  "OPEN->STARTING",
  "OPEN->CANCELLED",
  "FULL->OPEN",
  "FULL->STARTING",
  "FULL->CANCELLED",
  "STARTING->LIVE",
  "STARTING->CANCELLED",
  "LIVE->PAUSED",
  "LIVE->COMPLETED",
  "LIVE->CANCELLED",
  "PAUSED->LIVE",
  "PAUSED->CANCELLED",
]);

describe("game state machine — exhaustive transition matrix", () => {
  for (const from of GAME_STATUSES) {
    for (const to of GAME_STATUSES) {
      const key = `${from}->${to}`;
      const shouldBeValid = VALID_PAIRS.has(key);

      it(`${key} is ${shouldBeValid ? "ALLOWED" : "REJECTED"}`, () => {
        expect(canTransition(from, to)).toBe(shouldBeValid);
        if (shouldBeValid) {
          expect(() => assertValidTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertValidTransition(from, to)).toThrow(InvalidGameTransitionError);
        }
      });
    }
  }

  it("COMPLETED and CANCELLED are true terminal states — nothing transitions out of them", () => {
    for (const to of GAME_STATUSES) {
      expect(canTransition("COMPLETED", to)).toBe(false);
      expect(canTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("no state can transition to itself", () => {
    for (const status of GAME_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
