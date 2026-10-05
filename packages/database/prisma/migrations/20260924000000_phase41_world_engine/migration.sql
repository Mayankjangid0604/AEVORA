-- CreateEnum
CREATE TYPE "OutreachDraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OutreachResponseType" AS ENUM ('DELIVERED', 'BOUNCED', 'REPLIED', 'INTERESTED', 'NOT_INTERESTED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "WeEventCategory" AS ENUM ('COMMODITY_PRICE', 'FX_MOVEMENT', 'INTEREST_RATE', 'INFLATION', 'GEOPOLITICAL', 'TECHNOLOGY', 'SUPPLY_CHAIN', 'REGULATORY', 'MARKET_SHOCK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WeEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WeEventSource" AS ENUM ('MOCK', 'HISTORICAL', 'LIVE', 'WHAT_IF');

-- CreateEnum
CREATE TYPE "WeIndicatorType" AS ENUM ('OIL_PRICE_BRENT', 'OIL_PRICE_WTI', 'GOLD_PRICE', 'USD_INR', 'EUR_USD', 'GBP_USD', 'INTEREST_RATE_BASE', 'INFLATION_RATE', 'GDP_GROWTH', 'UNEMPLOYMENT_RATE', 'CUSTOM');

-- AlterTable
ALTER TABLE "ConnectedDevice" ALTER COLUMN "status" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ResearchResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "contactInfo" JSONB,
    "qualificationHypothesis" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "researchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "salesLeadId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "reasonForContact" TEXT,
    "researchEvidence" JSONB,
    "proposedNextAction" TEXT,
    "riskFlags" JSONB,
    "status" "OutreachDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachResponse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "responseType" "OutreachResponseType" NOT NULL,
    "responseDetails" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeWorldEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "WeEventCategory" NOT NULL,
    "severity" "WeEventSeverity" NOT NULL,
    "source" "WeEventSource" NOT NULL DEFAULT 'MOCK',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeWorldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeEconomicIndicator" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "worldEventId" TEXT,
    "indicatorType" "WeIndicatorType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "deltaPercent" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "source" "WeEventSource" NOT NULL DEFAULT 'MOCK',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeEconomicIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeMarketState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "energyCostIndex" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "usdInrRate" DOUBLE PRECISION,
    "eurUsdRate" DOUBLE PRECISION,
    "inflationRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "baseInterestRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "gdpGrowthRate" DOUBLE PRECISION,
    "supplyCostIndex" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "logisticsCostIndex" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "consumerDemandIndex" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "geopoliticalRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventId" TEXT,
    "tickCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WeMarketState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchResult_companyId_businessName_idx" ON "ResearchResult"("companyId", "businessName");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachDraft_idempotencyKey_key" ON "OutreachDraft"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutreachDraft_companyId_status_idx" ON "OutreachDraft"("companyId", "status");

-- CreateIndex
CREATE INDEX "OutreachDraft_companyId_recipientEmail_idx" ON "OutreachDraft"("companyId", "recipientEmail");

-- CreateIndex
CREATE INDEX "OutreachResponse_companyId_draftId_idx" ON "OutreachResponse"("companyId", "draftId");

-- CreateIndex
CREATE INDEX "WeWorldEvent_companyId_category_idx" ON "WeWorldEvent"("companyId", "category");

-- CreateIndex
CREATE INDEX "WeWorldEvent_companyId_occurredAt_idx" ON "WeWorldEvent"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeWorldEvent_companyId_idempotencyKey_key" ON "WeWorldEvent"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WeEconomicIndicator_companyId_indicatorType_recordedAt_idx" ON "WeEconomicIndicator"("companyId", "indicatorType", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeMarketState_companyId_key" ON "WeMarketState"("companyId");

-- CreateIndex
DROP INDEX IF EXISTS "AIProvisioningRequest_idempotencyKey_key";
CREATE UNIQUE INDEX "AIProvisioningRequest_idempotencyKey_key" ON "AIProvisioningRequest"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "ResearchResult" ADD CONSTRAINT "ResearchResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachResponse" ADD CONSTRAINT "OutreachResponse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeWorldEvent" ADD CONSTRAINT "WeWorldEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeEconomicIndicator" ADD CONSTRAINT "WeEconomicIndicator_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeEconomicIndicator" ADD CONSTRAINT "WeEconomicIndicator_worldEventId_fkey" FOREIGN KEY ("worldEventId") REFERENCES "WeWorldEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeMarketState" ADD CONSTRAINT "WeMarketState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

