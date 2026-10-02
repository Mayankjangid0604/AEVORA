-- Phase 30: Autonomous Company Management
-- Migration: 20260923200000_phase30_management

-- -------------------------------------------------------
-- Enums
-- -------------------------------------------------------
CREATE TYPE "ObjectiveStatus" AS ENUM ('PROPOSED', 'APPROVED', 'ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ObjectivePriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');
CREATE TYPE "CompanyHealthStatus" AS ENUM ('HEALTHY', 'WATCH', 'AT_RISK', 'CRITICAL');
CREATE TYPE "KpiStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'MISSED', 'EXCEEDED');
CREATE TYPE "KpiTrend" AS ENUM ('IMPROVING', 'STABLE', 'DECLINING');
CREATE TYPE "KpiPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE "CompanyRiskStatus" AS ENUM ('IDENTIFIED', 'MITIGATING', 'RESOLVED', 'ACCEPTED');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ManagementCycleType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ManagementCycleStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "ExecutiveDecisionStatus" AS ENUM ('PROPOSED', 'REVIEW', 'APPROVAL_REQUIRED', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ExecutiveDecisionType" AS ENUM ('RESOURCE_ALLOCATION', 'STAFFING_CHANGE', 'PRIORITY_CHANGE', 'PROJECT_INTERVENTION', 'BUDGET_RECOMMENDATION', 'HIRING_RECOMMENDATION', 'CUSTOMER_ESCALATION', 'SALES_INTERVENTION', 'MARKETING_INTERVENTION', 'OPERATIONAL_INTERVENTION', 'STRATEGIC_RECOMMENDATION');
CREATE TYPE "DecisionPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');
CREATE TYPE "EscalationStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "OpportunityType" AS ENUM ('CUSTOMER_EXPANSION', 'SALES_OPPORTUNITY', 'EFFICIENCY_IMPROVEMENT', 'HIRING_OPPORTUNITY', 'PRODUCT_OPPORTUNITY', 'COST_OPTIMIZATION');
CREATE TYPE "CompanyOpportunityStatus" AS ENUM ('IDENTIFIED', 'ANALYZING', 'RECOMMENDED', 'ACTIONED', 'DISMISSED');
CREATE TYPE "ResourceType" AS ENUM ('EMPLOYEE', 'AI_WORKER', 'PROJECT_CAPACITY', 'AC_BUDGET', 'MARKETING_CAPACITY', 'ENGINEERING_CAPACITY', 'SALES_CAPACITY');
CREATE TYPE "AllocationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'EXECUTED', 'REJECTED');
CREATE TYPE "OrgMemoryType" AS ENUM ('DECISION_OUTCOME', 'RECURRING_RISK', 'LESSON', 'SUCCESSFUL_INTERVENTION', 'FAILED_INTERVENTION');

-- -------------------------------------------------------
-- CompanyObjective
-- -------------------------------------------------------
CREATE TABLE "CompanyObjective" (
    "id"                   TEXT NOT NULL,
    "companyId"            TEXT NOT NULL,
    "title"                TEXT NOT NULL,
    "description"          TEXT,
    "ownerId"              TEXT NOT NULL,
    "departmentId"         TEXT,
    "parentObjectiveId"    TEXT,
    "priority"             "ObjectivePriority" NOT NULL DEFAULT 'NORMAL',
    "status"               "ObjectiveStatus" NOT NULL DEFAULT 'PROPOSED',
    "startDate"            TIMESTAMP(3),
    "targetDate"           TIMESTAMP(3),
    "metrics"              JSONB NOT NULL DEFAULT '[]',
    "progress"             INTEGER NOT NULL DEFAULT 0,
    "evidenceNote"         TEXT,
    "approvedById"         TEXT,
    "approvedAt"           TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyObjective_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyObjective_companyId_idx" ON "CompanyObjective"("companyId");
CREATE INDEX "CompanyObjective_companyId_status_idx" ON "CompanyObjective"("companyId", "status");
ALTER TABLE "CompanyObjective" ADD CONSTRAINT "CompanyObjective_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyObjective" ADD CONSTRAINT "CompanyObjective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyObjective" ADD CONSTRAINT "CompanyObjective_parentObjectiveId_fkey" FOREIGN KEY ("parentObjectiveId") REFERENCES "CompanyObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -------------------------------------------------------
-- CompanyKPI
-- -------------------------------------------------------
CREATE TABLE "CompanyKPI" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "ownerId"         TEXT NOT NULL,
    "objectiveId"     TEXT,
    "period"          "KpiPeriod" NOT NULL DEFAULT 'MONTHLY',
    "baseline"        INTEGER NOT NULL DEFAULT 0,
    "target"          INTEGER NOT NULL DEFAULT 0,
    "currentValue"    INTEGER NOT NULL DEFAULT 0,
    "unit"            TEXT,
    "sourceSystem"    TEXT,
    "sourceRef"       TEXT,
    "trend"           "KpiTrend" NOT NULL DEFAULT 'STABLE',
    "status"          "KpiStatus" NOT NULL DEFAULT 'ON_TRACK',
    "isAdvisory"      BOOLEAN NOT NULL DEFAULT true,
    "generatedBy"     TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyKPI_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyKPI_companyId_idx" ON "CompanyKPI"("companyId");
ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "CompanyObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -------------------------------------------------------
-- CompanyHealthSnapshot (aggregated, NOT authoritative data)
-- -------------------------------------------------------
CREATE TABLE "CompanyHealthSnapshot" (
    "id"                 TEXT NOT NULL,
    "companyId"          TEXT NOT NULL,
    "status"             "CompanyHealthStatus" NOT NULL DEFAULT 'WATCH',
    "financialScore"     INTEGER NOT NULL DEFAULT 50,
    "salesScore"         INTEGER NOT NULL DEFAULT 50,
    "marketingScore"     INTEGER NOT NULL DEFAULT 50,
    "workforceScore"     INTEGER NOT NULL DEFAULT 50,
    "operationsScore"    INTEGER NOT NULL DEFAULT 50,
    "customerScore"      INTEGER NOT NULL DEFAULT 50,
    "evidence"           JSONB NOT NULL DEFAULT '{}',
    "reasons"            JSONB NOT NULL DEFAULT '[]',
    "generatedBy"        TEXT NOT NULL,
    "calculationVersion" TEXT NOT NULL DEFAULT '1.0',
    "snapshotAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleId"            TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyHealthSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyHealthSnapshot_companyId_snapshotAt_idx" ON "CompanyHealthSnapshot"("companyId", "snapshotAt" DESC);
ALTER TABLE "CompanyHealthSnapshot" ADD CONSTRAINT "CompanyHealthSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- ManagementCycle
-- -------------------------------------------------------
CREATE TABLE "ManagementCycle" (
    "id"                  TEXT NOT NULL,
    "companyId"           TEXT NOT NULL,
    "cycleType"           "ManagementCycleType" NOT NULL,
    "status"              "ManagementCycleStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy"         TEXT NOT NULL,
    "idempotencyKey"      TEXT NOT NULL,
    "healthStatus"        "CompanyHealthStatus",
    "anomaliesDetected"   JSONB NOT NULL DEFAULT '[]',
    "risksIdentified"     INTEGER NOT NULL DEFAULT 0,
    "opportunitiesFound"  INTEGER NOT NULL DEFAULT 0,
    "decisionsGenerated"  INTEGER NOT NULL DEFAULT 0,
    "escalationsCreated"  INTEGER NOT NULL DEFAULT 0,
    "summary"             JSONB NOT NULL DEFAULT '{}',
    "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"         TIMESTAMP(3),
    "error"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagementCycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManagementCycle_companyId_idempotencyKey_key" ON "ManagementCycle"("companyId", "idempotencyKey");
CREATE INDEX "ManagementCycle_companyId_cycleType_idx" ON "ManagementCycle"("companyId", "cycleType");
ALTER TABLE "ManagementCycle" ADD CONSTRAINT "ManagementCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- ExecutiveDecision
-- -------------------------------------------------------
CREATE TABLE "ExecutiveDecision" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "proposerId"       TEXT NOT NULL,
    "decisionType"     "ExecutiveDecisionType" NOT NULL,
    "subject"          TEXT NOT NULL,
    "description"      TEXT,
    "artifactType"     TEXT NOT NULL DEFAULT 'RECOMMENDATION',
    "evidence"         JSONB NOT NULL DEFAULT '[]',
    "analysis"         JSONB NOT NULL DEFAULT '{}',
    "recommendation"   JSONB NOT NULL DEFAULT '{}',
    "alternatives"     JSONB NOT NULL DEFAULT '[]',
    "expectedImpact"   JSONB NOT NULL DEFAULT '{}',
    "riskLevel"        "RiskLevel" NOT NULL DEFAULT 'LOW',
    "priority"         "DecisionPriority" NOT NULL DEFAULT 'NORMAL',
    "requiredApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalId"       TEXT,
    "status"           "ExecutiveDecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "decisionMakerId"  TEXT,
    "executionState"   JSONB NOT NULL DEFAULT '{}',
    "result"           JSONB NOT NULL DEFAULT '{}',
    "cycleId"          TEXT,
    "proposedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt"       TIMESTAMP(3),
    "executedAt"       TIMESTAMP(3),
    "completedAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExecutiveDecision_companyId_status_idx" ON "ExecutiveDecision"("companyId", "status");
CREATE INDEX "ExecutiveDecision_companyId_priority_idx" ON "ExecutiveDecision"("companyId", "priority");
ALTER TABLE "ExecutiveDecision" ADD CONSTRAINT "ExecutiveDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutiveDecision" ADD CONSTRAINT "ExecutiveDecision_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- CompanyRisk
-- -------------------------------------------------------
CREATE TABLE "CompanyRisk" (
    "id"                  TEXT NOT NULL,
    "companyId"           TEXT NOT NULL,
    "title"               TEXT NOT NULL,
    "description"         TEXT,
    "probability"         "RiskLevel" NOT NULL DEFAULT 'LOW',
    "impact"              "RiskLevel" NOT NULL DEFAULT 'LOW',
    "score"               INTEGER NOT NULL DEFAULT 0,
    "evidence"            JSONB NOT NULL DEFAULT '[]',
    "ownerId"             TEXT NOT NULL,
    "mitigation"          JSONB NOT NULL DEFAULT '{}',
    "status"              "CompanyRiskStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "isAdvisory"          BOOLEAN NOT NULL DEFAULT true,
    "discoveredBy"        TEXT NOT NULL,
    "cycleId"             TEXT,
    "relatedDecisionId"   TEXT,
    "discoveredAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"          TIMESTAMP(3),
    "resolvedBy"          TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyRisk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyRisk_companyId_status_idx" ON "CompanyRisk"("companyId", "status");
CREATE INDEX "CompanyRisk_companyId_score_idx" ON "CompanyRisk"("companyId", "score" DESC);
ALTER TABLE "CompanyRisk" ADD CONSTRAINT "CompanyRisk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyRisk" ADD CONSTRAINT "CompanyRisk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyRisk" ADD CONSTRAINT "CompanyRisk_discoveredBy_fkey" FOREIGN KEY ("discoveredBy") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- CompanyOpportunity
-- -------------------------------------------------------
CREATE TABLE "CompanyOpportunity" (
    "id"                TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "description"       TEXT,
    "opportunityType"   "OpportunityType" NOT NULL,
    "evidence"          JSONB NOT NULL DEFAULT '[]',
    "ownerId"           TEXT NOT NULL,
    "status"            "CompanyOpportunityStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "expectedImpact"    JSONB NOT NULL DEFAULT '{}',
    "relatedDecisionId" TEXT,
    "cycleId"           TEXT,
    "isAdvisory"        BOOLEAN NOT NULL DEFAULT true,
    "discoveredAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyOpportunity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyOpportunity_companyId_status_idx" ON "CompanyOpportunity"("companyId", "status");
ALTER TABLE "CompanyOpportunity" ADD CONSTRAINT "CompanyOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyOpportunity" ADD CONSTRAINT "CompanyOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- EscalationRecord (Chairman decision queue)
-- -------------------------------------------------------
CREATE TABLE "EscalationRecord" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "decisionId"       TEXT,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "reason"           TEXT NOT NULL,
    "evidence"         JSONB NOT NULL DEFAULT '[]',
    "proposedAction"   JSONB NOT NULL DEFAULT '{}',
    "expectedImpact"   JSONB NOT NULL DEFAULT '{}',
    "riskLevel"        "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "priority"         "DecisionPriority" NOT NULL DEFAULT 'NORMAL',
    "escalatedBy"      TEXT NOT NULL,
    "escalatedTo"      TEXT NOT NULL DEFAULT 'CHAIRMAN',
    "status"           "EscalationStatus" NOT NULL DEFAULT 'PENDING',
    "deadline"         TIMESTAMP(3),
    "resolvedBy"       TEXT,
    "resolutionNote"   TEXT,
    "acknowledgedAt"   TIMESTAMP(3),
    "resolvedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EscalationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EscalationRecord_companyId_status_idx" ON "EscalationRecord"("companyId", "status");
CREATE INDEX "EscalationRecord_companyId_priority_idx" ON "EscalationRecord"("companyId", "priority");
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_escalatedBy_fkey" FOREIGN KEY ("escalatedBy") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- ResourceAllocationRecord
-- -------------------------------------------------------
CREATE TABLE "ResourceAllocationRecord" (
    "id"            TEXT NOT NULL,
    "companyId"     TEXT NOT NULL,
    "resourceType"  "ResourceType" NOT NULL,
    "resourceId"    TEXT NOT NULL,
    "fromContext"   JSONB NOT NULL DEFAULT '{}',
    "toContext"     JSONB NOT NULL DEFAULT '{}',
    "reason"        TEXT NOT NULL,
    "justification" TEXT,
    "requestedBy"   TEXT NOT NULL,
    "approvedBy"    TEXT,
    "status"        "AllocationStatus" NOT NULL DEFAULT 'PROPOSED',
    "isAdvisory"    BOOLEAN NOT NULL DEFAULT true,
    "approvalId"    TEXT,
    "cycleId"       TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceAllocationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceAllocationRecord_companyId_status_idx" ON "ResourceAllocationRecord"("companyId", "status");
ALTER TABLE "ResourceAllocationRecord" ADD CONSTRAINT "ResourceAllocationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceAllocationRecord" ADD CONSTRAINT "ResourceAllocationRecord_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- OrganizationalMemory (append-only tenant-scoped memory)
-- -------------------------------------------------------
CREATE TABLE "OrganizationalMemory" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "memoryType"       "OrgMemoryType" NOT NULL,
    "subject"          TEXT NOT NULL,
    "content"          TEXT NOT NULL,
    "tags"             JSONB NOT NULL DEFAULT '[]',
    "sourceDecisionId" TEXT,
    "sourceRiskId"     TEXT,
    "sourceCycleId"    TEXT,
    "recordedBy"       TEXT NOT NULL,
    "relevanceScore"   INTEGER NOT NULL DEFAULT 50,
    "expiresAt"        TIMESTAMP(3),
    "isArchived"       BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationalMemory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizationalMemory_companyId_memoryType_idx" ON "OrganizationalMemory"("companyId", "memoryType");
CREATE INDEX "OrganizationalMemory_companyId_isArchived_idx" ON "OrganizationalMemory"("companyId", "isArchived");
ALTER TABLE "OrganizationalMemory" ADD CONSTRAINT "OrganizationalMemory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------
-- ManagementAuditEvent (append-only)
-- -------------------------------------------------------
CREATE TABLE "ManagementAuditEvent" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "actorId"     TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "objectType"  TEXT,
    "objectId"    TEXT,
    "oldValue"    JSONB,
    "newValue"    JSONB,
    "cycleId"     TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagementAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ManagementAuditEvent_companyId_createdAt_idx" ON "ManagementAuditEvent"("companyId", "createdAt" DESC);
CREATE INDEX "ManagementAuditEvent_companyId_actorId_idx" ON "ManagementAuditEvent"("companyId", "actorId");
ALTER TABLE "ManagementAuditEvent" ADD CONSTRAINT "ManagementAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
