-- AlterTable: enforce unique names so dev-seed upserts are stable and admins can't create duplicate patterns/rules by name.
CREATE UNIQUE INDEX "WinningPattern_name_key" ON "WinningPattern"("name");
CREATE UNIQUE INDEX "PrizeRule_name_key" ON "PrizeRule"("name");
