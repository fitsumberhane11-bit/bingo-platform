-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';

-- DropIndex
DROP INDEX "PaymentCallbackLog_provider_providerTxnId_processedResult_key";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "PaymentCallbackLog" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "providerEventId" TEXT,
ALTER COLUMN "providerTxnId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_providerOrderId_idx" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE INDEX "PaymentCallbackLog_paymentId_idx" ON "PaymentCallbackLog"("paymentId");

-- AddForeignKey
ALTER TABLE "PaymentCallbackLog" ADD CONSTRAINT "PaymentCallbackLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
