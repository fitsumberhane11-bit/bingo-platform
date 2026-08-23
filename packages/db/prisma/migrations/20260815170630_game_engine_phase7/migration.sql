/*
  Warnings:

  - Added the required column `calledSequenceNumber` to the `Winner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `winningPositions` to the `Winner` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PatternMatchType" AS ENUM ('EXACT_MATCH', 'ANY_ROWS', 'ANY_COLUMNS');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "calledCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Winner" ADD COLUMN     "calledSequenceNumber" INTEGER NOT NULL,
ADD COLUMN     "winningPositions" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "WinningPattern" ADD COLUMN     "config" JSONB,
ADD COLUMN     "matchType" "PatternMatchType" NOT NULL DEFAULT 'EXACT_MATCH',
ALTER COLUMN "matrix" DROP NOT NULL;
