-- AlterEnum
BEGIN;
CREATE TYPE "WithdrawalStatus_new" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');
ALTER TABLE "Withdrawal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Withdrawal" ALTER COLUMN "status" TYPE "WithdrawalStatus_new" USING ("status"::text::"WithdrawalStatus_new");
ALTER TYPE "WithdrawalStatus" RENAME TO "WithdrawalStatus_old";
ALTER TYPE "WithdrawalStatus_new" RENAME TO "WithdrawalStatus";
DROP TYPE "WithdrawalStatus_old";
ALTER TABLE "Withdrawal" ALTER COLUMN "status" SET DEFAULT 'REQUESTED';
COMMIT;
