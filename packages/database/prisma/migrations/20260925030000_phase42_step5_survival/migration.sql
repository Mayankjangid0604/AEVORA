-- CreateEnum
CREATE TYPE "SurvivalStatus" AS ENUM ('HEALTHY', 'WARNING', 'CRITICAL', 'SHUTDOWN');

-- CreateTable
CREATE TABLE "SurvivalConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "minBalancePaise" INTEGER NOT NULL DEFAULT 50000,
    "warningBalancePaise" INTEGER NOT NULL DEFAULT 200000,
    "currentStatus" "SurvivalStatus" NOT NULL DEFAULT 'HEALTHY',
    "lastBalancePaise" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "shutdownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivalEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "balancePaise" INTEGER NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurvivalConfig_companyId_key" ON "SurvivalConfig"("companyId");

-- CreateIndex
CREATE INDEX "SurvivalEvent_companyId_createdAt_idx" ON "SurvivalEvent"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "SurvivalConfig" ADD CONSTRAINT "SurvivalConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivalEvent" ADD CONSTRAINT "SurvivalEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

