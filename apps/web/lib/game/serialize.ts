import type { Game } from "@bingo/db";

/**
 * Strips fields that must never leave the server from a raw `Game` row
 * before it's returned in an API response. `secretSeedEncrypted` in
 * particular: even though it's encrypted at rest, an admin-facing endpoint
 * has no legitimate reason to ever put that ciphertext on the wire —
 * defense in depth against both a future decryption-key compromise and
 * simply reducing what a captured response could reveal. Every game
 * lifecycle route (create/schedule/open/start/pause/resume/cancel) returns
 * the raw engine result through this before calling `jsonOk`.
 */
export function sanitizeGameForResponse<T extends Partial<Game>>(game: T): Omit<T, "secretSeedEncrypted"> {
  const { secretSeedEncrypted: _secretSeedEncrypted, ...rest } = game;
  return rest;
}
