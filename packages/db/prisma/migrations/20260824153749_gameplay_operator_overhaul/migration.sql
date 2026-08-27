-- CreateEnum
CREATE TYPE "ClaimValidationStatus" AS ENUM ('VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "ClaimConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WinningStageStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GameEventType" ADD VALUE 'PRIZE_CONFIGURED';
ALTER TYPE "GameEventType" ADD VALUE 'RULES_CONFIGURED';
ALTER TYPE "GameEventType" ADD VALUE 'BINGO_CLAIM_SUBMITTED';
ALTER TYPE "GameEventType" ADD VALUE 'BINGO_CLAIM_VALID';
ALTER TYPE "GameEventType" ADD VALUE 'BINGO_CLAIM_INVALID';
ALTER TYPE "GameEventType" ADD VALUE 'WINNER_CONFIRMED';
ALTER TYPE "GameEventType" ADD VALUE 'WINNER_CLAIM_REJECTED';
ALTER TYPE "GameEventType" ADD VALUE 'CARD_DISQUALIFIED';
ALTER TYPE "GameEventType" ADD VALUE 'PLAYER_REMOVED_FROM_GAME';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PatternMatchType" ADD VALUE 'ANY_OF_SET';
ALTER TYPE "PatternMatchType" ADD VALUE 'COUNT_THRESHOLD';

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'DISQUALIFIED';

-- AlterTable
ALTER TABLE "BingoTicket" ADD COLUMN     "disqualifiedAt" TIMESTAMP(3),
ADD COLUMN     "disqualifiedReason" TEXT,
ADD COLUMN     "falseClaimCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "falseBingoPolicy" JSONB,
ADD COLUMN     "operatorPrizeAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Winner" ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "winningStageId" TEXT;

-- CreateTable
CREATE TABLE "WinningStage" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "patternId" TEXT NOT NULL,
    "label" TEXT,
    "prizeAmount" DECIMAL(18,2) NOT NULL,
    "winnerLimit" INTEGER NOT NULL DEFAULT 1,
    "winnerCount" INTEGER NOT NULL DEFAULT 0,
    "status" "WinningStageStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinningStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoClaim" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stageId" TEXT,
    "patternId" TEXT NOT NULL,
    "validationStatus" "ClaimValidationStatus" NOT NULL,
    "invalidReason" TEXT,
    "confirmationStatus" "ClaimConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BingoClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinningStage_gameId_status_idx" ON "WinningStage"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WinningStage_gameId_order_key" ON "WinningStage"("gameId", "order");

-- CreateIndex
CREATE INDEX "BingoClaim_gameId_ticketId_idx" ON "BingoClaim"("gameId", "ticketId");

-- CreateIndex
CREATE INDEX "BingoClaim_gameId_userId_idx" ON "BingoClaim"("gameId", "userId");

-- CreateIndex
CREATE INDEX "BingoClaim_gameId_validationStatus_idx" ON "BingoClaim"("gameId", "validationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_claimId_key" ON "Winner"("claimId");

-- CreateIndex
CREATE INDEX "Winner_winningStageId_idx" ON "Winner"("winningStageId");

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_winningStageId_fkey" FOREIGN KEY ("winningStageId") REFERENCES "WinningStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "BingoClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinningStage" ADD CONSTRAINT "WinningStage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinningStage" ADD CONSTRAINT "WinningStage_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WinningPattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoClaim" ADD CONSTRAINT "BingoClaim_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoClaim" ADD CONSTRAINT "BingoClaim_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BingoTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoClaim" ADD CONSTRAINT "BingoClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoClaim" ADD CONSTRAINT "BingoClaim_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WinningStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoClaim" ADD CONSTRAINT "BingoClaim_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WinningPattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

