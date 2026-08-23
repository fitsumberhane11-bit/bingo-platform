-- CreateTable
CREATE TABLE "ResponsibleGamingLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyDepositLimit" DECIMAL(18,2),
    "weeklyDepositLimit" DECIMAL(18,2),
    "dailySpendLimit" DECIMAL(18,2),
    "weeklySpendLimit" DECIMAL(18,2),
    "pendingIncreaseEffectiveAt" TIMESTAMP(3),
    "pendingDailyDepositLimit" DECIMAL(18,2),
    "pendingWeeklyDepositLimit" DECIMAL(18,2),
    "pendingDailySpendLimit" DECIMAL(18,2),
    "pendingWeeklySpendLimit" DECIMAL(18,2),
    "coolingOffUntil" TIMESTAMP(3),
    "selfExcludedUntil" TIMESTAMP(3),
    "selfExcludedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsibleGamingLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResponsibleGamingLimit_userId_key" ON "ResponsibleGamingLimit"("userId");

-- AddForeignKey
ALTER TABLE "ResponsibleGamingLimit" ADD CONSTRAINT "ResponsibleGamingLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
