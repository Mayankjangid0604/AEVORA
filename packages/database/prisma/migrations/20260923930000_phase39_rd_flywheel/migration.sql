-- CreateEnum
CREATE TYPE "RdPortfolioStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RdInitiativeStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RdCapabilityMaturity" AS ENUM ('NONE', 'EMERGING', 'DEVELOPING', 'MATURE', 'LEADING');

-- CreateEnum
CREATE TYPE "RdFeedbackType" AS ENUM ('PRODUCT_OUTCOME', 'CUSTOMER_INSIGHT', 'MODEL_PERFORMANCE', 'RESEARCH_FINDING', 'MARKET_SIGNAL');

-- CreateTable
CREATE TABLE "RdPortfolio" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RdPortfolioStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdInitiative" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RdInitiativeStatus" NOT NULL DEFAULT 'PROPOSED',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "researchRef" TEXT,
    "modelRef" TEXT,
    "productRef" TEXT,
    "estimatedCostMc" INTEGER,
    "actualCostMc" INTEGER,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "proposedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdInitiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdCapability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT,
    "maturity" "RdCapabilityMaturity" NOT NULL DEFAULT 'NONE',
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "assessedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdCapabilityLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RdCapabilityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdFeedbackItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "feedbackType" "RdFeedbackType" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "sourceRef" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "submittedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdFeedbackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdResourcePlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalQuarter" INTEGER,
    "allocatedMc" INTEGER NOT NULL,
    "forecastedMc" INTEGER,
    "notes" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdResourcePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RdAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RdPortfolio_companyId_status_idx" ON "RdPortfolio"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RdPortfolio_companyId_name_key" ON "RdPortfolio"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RdInitiative_idempotencyKey_key" ON "RdInitiative"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RdInitiative_companyId_portfolioId_status_idx" ON "RdInitiative"("companyId", "portfolioId", "status");

-- CreateIndex
CREATE INDEX "RdCapability_companyId_domain_idx" ON "RdCapability"("companyId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "RdCapability_companyId_name_key" ON "RdCapability"("companyId", "name");

-- CreateIndex
CREATE INDEX "RdCapabilityLink_companyId_initiativeId_idx" ON "RdCapabilityLink"("companyId", "initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "RdCapabilityLink_initiativeId_capabilityId_key" ON "RdCapabilityLink"("initiativeId", "capabilityId");

-- CreateIndex
CREATE INDEX "RdFeedbackItem_companyId_initiativeId_idx" ON "RdFeedbackItem"("companyId", "initiativeId");

-- CreateIndex
CREATE INDEX "RdFeedbackItem_companyId_feedbackType_idx" ON "RdFeedbackItem"("companyId", "feedbackType");

-- CreateIndex
CREATE INDEX "RdResourcePlan_companyId_portfolioId_idx" ON "RdResourcePlan"("companyId", "portfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "RdResourcePlan_companyId_portfolioId_fiscalYear_fiscalQuart_key" ON "RdResourcePlan"("companyId", "portfolioId", "fiscalYear", "fiscalQuarter");

-- CreateIndex
CREATE INDEX "RdAuditEvent_companyId_portfolioId_idx" ON "RdAuditEvent"("companyId", "portfolioId");

-- CreateIndex
CREATE INDEX "RdAuditEvent_companyId_createdAt_idx" ON "RdAuditEvent"("companyId", "createdAt");


-- AddForeignKey
ALTER TABLE "RdPortfolio" ADD CONSTRAINT "RdPortfolio_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdInitiative" ADD CONSTRAINT "RdInitiative_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "RdPortfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdCapabilityLink" ADD CONSTRAINT "RdCapabilityLink_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "RdInitiative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdCapabilityLink" ADD CONSTRAINT "RdCapabilityLink_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "RdCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdFeedbackItem" ADD CONSTRAINT "RdFeedbackItem_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "RdInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdAuditEvent" ADD CONSTRAINT "RdAuditEvent_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "RdPortfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

