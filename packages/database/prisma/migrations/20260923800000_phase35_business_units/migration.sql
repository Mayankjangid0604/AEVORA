-- CreateEnum
CREATE TYPE "BuStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'RESTRUCTURING', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BuLifecycle" AS ENUM ('CHARTER', 'STRATEGY', 'OBJECTIVES', 'WORKFORCE', 'OPERATIONS', 'PERFORMANCE', 'REVIEW', 'RETIRED');

-- CreateEnum
CREATE TYPE "BuCapitalRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BuKpiStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_STARTED');

-- CreateEnum
CREATE TYPE "BuRiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "charter" TEXT,
    "status" "BuStatus" NOT NULL DEFAULT 'DRAFT',
    "lifecycle" "BuLifecycle" NOT NULL DEFAULT 'CHARTER',
    "leaderId" TEXT,
    "parentBuId" TEXT,
    "strategicThemeId" TEXT,
    "registeredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "retiredBy" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuObjective" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuKpi" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentValue" TEXT,
    "targetValue" TEXT,
    "unit" TEXT,
    "status" "BuKpiStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "recordedBy" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuBudget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalQuarter" INTEGER,
    "allocatedMc" INTEGER NOT NULL,
    "forecastedSpendMc" INTEGER,
    "actualSpendMc" INTEGER,
    "notes" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuRisk" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "BuRiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "likelihood" TEXT,
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "raisedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuCapitalRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountMc" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "justification" TEXT,
    "expectedReturn" TEXT,
    "status" "BuCapitalRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuCapitalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuPerformanceReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "summary" TEXT,
    "kpiScorePct" INTEGER,
    "reviewedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuPerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessUnit_companyId_status_idx" ON "BusinessUnit"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_companyId_code_key" ON "BusinessUnit"("companyId", "code");

-- CreateIndex
CREATE INDEX "BuObjective_companyId_buId_idx" ON "BuObjective"("companyId", "buId");

-- CreateIndex
CREATE INDEX "BuKpi_companyId_buId_idx" ON "BuKpi"("companyId", "buId");

-- CreateIndex
CREATE INDEX "BuBudget_companyId_buId_idx" ON "BuBudget"("companyId", "buId");

-- CreateIndex
CREATE UNIQUE INDEX "BuBudget_companyId_buId_fiscalYear_fiscalQuarter_key" ON "BuBudget"("companyId", "buId", "fiscalYear", "fiscalQuarter");

-- CreateIndex
CREATE INDEX "BuRisk_companyId_buId_idx" ON "BuRisk"("companyId", "buId");

-- CreateIndex
CREATE UNIQUE INDEX "BuCapitalRequest_idempotencyKey_key" ON "BuCapitalRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BuCapitalRequest_companyId_buId_status_idx" ON "BuCapitalRequest"("companyId", "buId", "status");

-- CreateIndex
CREATE INDEX "BuPerformanceReview_companyId_buId_idx" ON "BuPerformanceReview"("companyId", "buId");

-- CreateIndex
CREATE UNIQUE INDEX "BuPerformanceReview_companyId_buId_period_key" ON "BuPerformanceReview"("companyId", "buId", "period");

-- CreateIndex
CREATE INDEX "BuAuditEvent_companyId_buId_idx" ON "BuAuditEvent"("companyId", "buId");

-- CreateIndex
CREATE INDEX "BuAuditEvent_companyId_createdAt_idx" ON "BuAuditEvent"("companyId", "createdAt");


-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_parentBuId_fkey" FOREIGN KEY ("parentBuId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuObjective" ADD CONSTRAINT "BuObjective_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuKpi" ADD CONSTRAINT "BuKpi_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuBudget" ADD CONSTRAINT "BuBudget_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuRisk" ADD CONSTRAINT "BuRisk_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuCapitalRequest" ADD CONSTRAINT "BuCapitalRequest_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuPerformanceReview" ADD CONSTRAINT "BuPerformanceReview_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuAuditEvent" ADD CONSTRAINT "BuAuditEvent_buId_fkey" FOREIGN KEY ("buId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

