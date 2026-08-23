import { prisma } from "@bingo/db";
import { verifyFairness } from "@bingo/game-core";
import { decryptSecret } from "../crypto";
import { NotFoundError } from "../errors";

export interface FairnessReport {
  gameId: string;
  gameName: string;
  status: string;
  commitmentHash: string;
  seedRevealed: boolean;
  seed: string | null;
  calledSequence: number[];
  verification: {
    commitmentValid: boolean;
    sequenceValid: boolean;
  } | null;
}

/**
 * Builds the public fairness report for a game — safe to expose to anyone,
 * authenticated or not, since it never reveals the seed before the game
 * legitimately completes (`seedRevealedAt` is the gate, set only by
 * `completeGame`).
 */
export async function getFairnessReport(gameId: string): Promise<FairnessReport> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new NotFoundError("Game not found.");

  const calledNumbers = await prisma.bingoNumber.findMany({
    where: { gameId },
    orderBy: { sequenceNumber: "asc" },
    select: { ballNumber: true },
  });
  const calledSequence = calledNumbers.map((n) => n.ballNumber);

  const seedRevealed = !!game.seedRevealedAt;
  const seed = seedRevealed && game.secretSeedEncrypted ? decryptSecret(game.secretSeedEncrypted) : null;

  return {
    gameId: game.id,
    gameName: game.name,
    status: game.status,
    commitmentHash: game.seedCommitmentHash,
    seedRevealed,
    seed,
    calledSequence,
    verification: seed ? verifyFairness(seed, game.seedCommitmentHash, calledSequence) : null,
  };
}
