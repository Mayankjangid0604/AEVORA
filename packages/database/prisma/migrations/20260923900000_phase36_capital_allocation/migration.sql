-- CreateEnum
CREATE TYPE "CaAllocationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXECUTING', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ANALYZING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CaScenarioType" AS ENUM ('BASE', 'OPTIMISTIC', 'PESSIMISTIC', 'STRESS');

-- CreateEnum
CREATE TYPE "CaInvestmentCategory" AS ENUM ('PRODUCT', 'RESEARCH', 'INFRASTRUCTURE', 'WORKFORCE', 'MARKETING', 'ACQUISITION', 'OTHER');

-- CreateEnum
CREATE TYPE "CaRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "CaCapitalPool" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalMc" INTEGER NOT NULL,
    "availableMc" INTEGER NOT NULL,
    "committedMc" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fiscalYear" INTEGER NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaCapitalPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaAllocationProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "CaInvestmentCategory" NOT NULL DEFAULT 'OTHER',
    "targetBuId" TEXT,
    "targetProductId" TEXT,
    "targetStrategyId" TEXT,
    "requestedMc" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "justification" TEXT,
    "expectedRoiPct" INTEGER,
    "riskLevel" "CaRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "CaProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaAllocationProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaScenario" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "scenarioType" "CaScenarioType" NOT NULL DEFAULT 'BASE',
    "label" TEXT,
    "projectedReturnMc" INTEGER,
    "projectedRoiPct" INTEGER,
    "timeHorizonMonths" INTEGER,
    "assumptions" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaConstraint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxSingleAllocMc" INTEGER,
    "minLiquidityMc" INTEGER,
    "maxCategoryPct" INTEGER,
    "maxBuPct" INTEGER,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaAuthorizedAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "amountMc" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CaAllocationStatus" NOT NULL DEFAULT 'APPROVED',
    "authorizedBy" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "financeRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaAuthorizedAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaAllocationPerformance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "actualReturnMc" INTEGER,
    "expectedReturnMc" INTEGER,
    "varianceMc" INTEGER,
    "notes" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaAllocationPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "poolId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaCapitalPool_companyId_fiscalYear_idx" ON "CaCapitalPool"("companyId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "CaCapitalPool_companyId_name_fiscalYear_key" ON "CaCapitalPool"("companyId", "name", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "CaAllocationProposal_idempotencyKey_key" ON "CaAllocationProposal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CaAllocationProposal_companyId_poolId_status_idx" ON "CaAllocationProposal"("companyId", "poolId", "status");

-- CreateIndex
CREATE INDEX "CaScenario_companyId_proposalId_idx" ON "CaScenario"("companyId", "proposalId");

-- CreateIndex
CREATE INDEX "CaConstraint_companyId_poolId_idx" ON "CaConstraint"("companyId", "poolId");

-- CreateIndex
CREATE UNIQUE INDEX "CaAuthorizedAllocation_idempotencyKey_key" ON "CaAuthorizedAllocation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CaAuthorizedAllocation_companyId_proposalId_status_idx" ON "CaAuthorizedAllocation"("companyId", "proposalId", "status");

-- CreateIndex
CREATE INDEX "CaAllocationPerformance_companyId_allocationId_idx" ON "CaAllocationPerformance"("companyId", "allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "CaAllocationPerformance_companyId_allocationId_period_key" ON "CaAllocationPerformance"("companyId", "allocationId", "period");

-- CreateIndex
CREATE INDEX "CaAuditEvent_companyId_poolId_idx" ON "CaAuditEvent"("companyId", "poolId");

-- CreateIndex
CREATE INDEX "CaAuditEvent_companyId_createdAt_idx" ON "CaAuditEvent"("companyId", "createdAt");


-- AddForeignKey
ALTER TABLE "CaCapitalPool" ADD CONSTRAINT "CaCapitalPool_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaAllocationProposal" ADD CONSTRAINT "CaAllocationProposal_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CaCapitalPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaScenario" ADD CONSTRAINT "CaScenario_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CaAllocationProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaConstraint" ADD CONSTRAINT "CaConstraint_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CaCapitalPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaAuthorizedAllocation" ADD CONSTRAINT "CaAuthorizedAllocation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CaAllocationProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaAllocationPerformance" ADD CONSTRAINT "CaAllocationPerformance_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "CaAuthorizedAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaAuditEvent" ADD CONSTRAINT "CaAuditEvent_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CaCapitalPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

