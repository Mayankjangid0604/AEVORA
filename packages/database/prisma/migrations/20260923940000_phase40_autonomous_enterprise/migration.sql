-- CreateEnum
CREATE TYPE "AeObjectiveStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AeDecisionStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'ACTIONED', 'DEFERRED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AeEscalationLevel" AS ENUM ('INFO', 'ATTENTION', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AeOperatingCycleStatus" AS ENUM ('OPEN', 'REVIEWING', 'CLOSED');

-- CreateTable
CREATE TABLE "AeEnterpriseObjective" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AeObjectiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "dueDate" TIMESTAMP(3),
    "domainRefs" JSONB,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeEnterpriseObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeOperatingCycle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "AeOperatingCycleStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "openedBy" TEXT NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeOperatingCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeEscalation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT,
    "level" "AeEscalationLevel" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "domainRef" TEXT,
    "status" "AeDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "raisedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeChairmanDecision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AeDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "escalationId" TEXT,
    "domainRefs" JSONB,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeChairmanDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeRecommendation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "domain" TEXT,
    "domainRefs" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "proposedBy" TEXT NOT NULL,
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AeAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AeEnterpriseObjective_companyId_status_idx" ON "AeEnterpriseObjective"("companyId", "status");

-- CreateIndex
CREATE INDEX "AeOperatingCycle_companyId_status_idx" ON "AeOperatingCycle"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AeOperatingCycle_companyId_period_key" ON "AeOperatingCycle"("companyId", "period");

-- CreateIndex
CREATE INDEX "AeEscalation_companyId_cycleId_status_idx" ON "AeEscalation"("companyId", "cycleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AeChairmanDecision_idempotencyKey_key" ON "AeChairmanDecision"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AeChairmanDecision_companyId_status_idx" ON "AeChairmanDecision"("companyId", "status");

-- CreateIndex
CREATE INDEX "AeRecommendation_companyId_domain_idx" ON "AeRecommendation"("companyId", "domain");

-- CreateIndex
CREATE INDEX "AeAuditEvent_companyId_createdAt_idx" ON "AeAuditEvent"("companyId", "createdAt");


-- AddForeignKey
ALTER TABLE "AeEnterpriseObjective" ADD CONSTRAINT "AeEnterpriseObjective_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeOperatingCycle" ADD CONSTRAINT "AeOperatingCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeEscalation" ADD CONSTRAINT "AeEscalation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AeOperatingCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeChairmanDecision" ADD CONSTRAINT "AeChairmanDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

