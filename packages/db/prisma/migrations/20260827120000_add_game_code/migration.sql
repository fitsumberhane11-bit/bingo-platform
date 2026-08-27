-- AlterTable: add nullable first so existing rows can be backfilled with a
-- unique value before the NOT NULL + UNIQUE constraints are applied.
ALTER TABLE "Game" ADD COLUMN "gameCode" TEXT;

-- Backfill existing rows with a code derived from their own id — ids are
-- already globally unique, so an 8-hex-char slice of one (uppercased) is
-- collision-safe for any realistic table size. New rows going forward get
-- a properly random code from generateGameCode() in engine.ts instead;
-- this backfill only ever runs once, here.
UPDATE "Game" SET "gameCode" = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)) WHERE "gameCode" IS NULL;

ALTER TABLE "Game" ALTER COLUMN "gameCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Game_gameCode_key" ON "Game"("gameCode");
