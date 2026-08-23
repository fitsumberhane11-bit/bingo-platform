-- CreateEnum
CREATE TYPE "PlatformLedgerType" AS ENUM ('PRIZE_POOL_CONTRIBUTION', 'PLATFORM_FEE_REVENUE', 'PRIZE_PAYOUT', 'PRIZE_POOL_FORFEITED', 'REFUND');

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformAccount" (
    "id" TEXT NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "availableBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformLedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "PlatformLedgerType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "referenceId" TEXT NOT NULL,
    "relatedGameId" TEXT,
    "relatedTicketId" TEXT,
    "relatedWinnerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccount_singleton_key" ON "PlatformAccount"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformLedgerEntry_referenceId_key" ON "PlatformLedgerEntry"("referenceId");

-- CreateIndex
CREATE INDEX "PlatformLedgerEntry_relatedGameId_createdAt_idx" ON "PlatformLedgerEntry"("relatedGameId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformLedgerEntry_type_idx" ON "PlatformLedgerEntry"("type");

-- CreateIndex
CREATE INDEX "Announcement_targetType_active_idx" ON "Announcement"("targetType", "active");

-- AddForeignKey
ALTER TABLE "PlatformLedgerEntry" ADD CONSTRAINT "PlatformLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlatformAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformLedgerEntry" ADD CONSTRAINT "PlatformLedgerEntry_relatedGameId_fkey" FOREIGN KEY ("relatedGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformLedgerEntry" ADD CONSTRAINT "PlatformLedgerEntry_relatedTicketId_fkey" FOREIGN KEY ("relatedTicketId") REFERENCES "BingoTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

