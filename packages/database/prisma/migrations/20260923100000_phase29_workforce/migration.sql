-- Phase 29: Autonomous Human/AI Workforce
-- Migration: 20260923100000_phase29_workforce

-- Enums
CREATE TYPE "WorkerType" AS ENUM ('HUMAN', 'AI', 'AI_AGENT', 'AI_MANAGER', 'AI_EXECUTIVE');
CREATE TYPE "SkillProficiencyLevel" AS ENUM ('NOVICE', 'BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
CREATE TYPE "HiringRequestStatus" AS ENUM ('WORKFORCE_NEED', 'CANDIDATE', 'REVIEW', 'APPROVED', 'OFFER', 'ONBOARDING', 'ACTIVE', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'CLOSED');
CREATE TYPE "BonusProposalStatus" AS ENUM ('PROPOSED', 'REVIEW', 'APPROVED', 'AWARDED', 'REJECTED');
CREATE TYPE "AIProvisioningStatus" AS ENUM ('PROPOSAL', 'APPROVAL_PENDING', 'APPROVED', 'PROVISIONING', 'ACTIVE', 'REJECTED', 'DEACTIVATED');
CREATE TYPE "WorkforcePlanStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'ARCHIVED');

-- WorkerProfile: extends Employee with Phase 29 workforce management fields
CREATE TABLE "WorkerProfile" (
    "id"               TEXT NOT NULL,
    "employeeId"       TEXT NOT NULL,
    "workerType"       "WorkerType" NOT NULL DEFAULT 'HUMAN',
    "managerId"        TEXT,
    "autonomyLevel"    "AutonomyLevel" NOT NULL DEFAULT 'MANUAL',
    "onboardingAt"     TIMESTAMP(3),
    "offboardedAt"     TIMESTAMP(3),
    "aiModel"          TEXT,
    "aiProvider"       TEXT,
    "aiSystemRole"     TEXT,
    "aiCapabilities"   JSONB NOT NULL DEFAULT '[]',
    "aiTools"          JSONB NOT NULL DEFAULT '[]',
    "aiMemoryScope"    TEXT DEFAULT 'COMPANY_SCOPED',
    "aiBudgetLimit"    INTEGER,
    "aiCostTracking"   INTEGER NOT NULL DEFAULT 0,
    "compensationBand" TEXT,
    "activeTaskCount"  INTEGER NOT NULL DEFAULT 0,
    "capacityLimit"    INTEGER NOT NULL DEFAULT 10,
    "companyId"        TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkerProfile_employeeId_key" ON "WorkerProfile"("employeeId");
CREATE INDEX "WorkerProfile_companyId_workerType_idx" ON "WorkerProfile"("companyId", "workerType");
CREATE INDEX "WorkerProfile_companyId_managerId_idx" ON "WorkerProfile"("companyId", "managerId");
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkerSkillVerification
CREATE TABLE "WorkerSkillVerification" (
    "id"               TEXT NOT NULL,
    "workerProfileId"  TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "skillName"        TEXT NOT NULL,
    "category"         TEXT NOT NULL,
    "proficiencyLevel" "SkillProficiencyLevel" NOT NULL DEFAULT 'NOVICE',
    "verified"         BOOLEAN NOT NULL DEFAULT false,
    "verifiedById"     TEXT,
    "verifiedAt"       TIMESTAMP(3),
    "evidence"         TEXT,
    "evidenceSource"   TEXT,
    "acquiredAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"        TIMESTAMP(3),
    "notes"            TEXT,
    CONSTRAINT "WorkerSkillVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkerSkillVerification_companyId_skillName_idx" ON "WorkerSkillVerification"("companyId", "skillName");
CREATE INDEX "WorkerSkillVerification_workerProfileId_idx" ON "WorkerSkillVerification"("workerProfileId");
ALTER TABLE "WorkerSkillVerification" ADD CONSTRAINT "WorkerSkillVerification_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HiringRequest
CREATE TABLE "HiringRequest" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "departmentId"     TEXT,
    "workerType"       "WorkerType" NOT NULL DEFAULT 'HUMAN',
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "requiredSkills"   JSONB NOT NULL DEFAULT '[]',
    "compensationBand" TEXT,
    "requestedById"    TEXT NOT NULL,
    "status"           "HiringRequestStatus" NOT NULL DEFAULT 'WORKFORCE_NEED',
    "approvalId"       TEXT,
    "approvedById"     TEXT,
    "approvedAt"       TIMESTAMP(3),
    "candidateName"    TEXT,
    "candidateRef"     TEXT,
    "offerDetails"     JSONB,
    "notes"            TEXT,
    "resultEmployeeId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HiringRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HiringRequest_companyId_status_idx" ON "HiringRequest"("companyId", "status");
CREATE INDEX "HiringRequest_companyId_workerType_idx" ON "HiringRequest"("companyId", "workerType");
ALTER TABLE "HiringRequest" ADD CONSTRAINT "HiringRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PerformanceReview
CREATE TABLE "PerformanceReview" (
    "id"                  TEXT NOT NULL,
    "companyId"           TEXT NOT NULL,
    "reviewPeriod"        TEXT NOT NULL,
    "workerProfileId"     TEXT NOT NULL,
    "reviewerId"          TEXT NOT NULL,
    "status"              "PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "goals"               JSONB NOT NULL DEFAULT '[]',
    "outcomes"            JSONB NOT NULL DEFAULT '[]',
    "strengths"           TEXT,
    "areasOfImprovement"  TEXT,
    "developmentAreas"    TEXT,
    "evidence"            JSONB NOT NULL DEFAULT '[]',
    "rating"              INTEGER,
    "recommendations"     TEXT,
    "submittedAt"         TIMESTAMP(3),
    "acknowledgedAt"      TIMESTAMP(3),
    "closedAt"            TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PerformanceReview_companyId_reviewPeriod_idx" ON "PerformanceReview"("companyId", "reviewPeriod");
CREATE INDEX "PerformanceReview_workerProfileId_idx" ON "PerformanceReview"("workerProfileId");
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "WorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BonusProposal
CREATE TABLE "BonusProposal" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "targetProfileId" TEXT NOT NULL,
    "proposerId"      TEXT NOT NULL,
    "amount"          INTEGER NOT NULL,
    "currency"        TEXT NOT NULL DEFAULT 'AC',
    "reason"          TEXT NOT NULL,
    "period"          TEXT NOT NULL,
    "status"          "BonusProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvalId"      TEXT,
    "approvedById"    TEXT,
    "approvedAt"      TIMESTAMP(3),
    "awardedAt"       TIMESTAMP(3),
    "rejectedReason"  TEXT,
    "isAdvisory"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BonusProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonusProposal_companyId_status_idx" ON "BonusProposal"("companyId", "status");
CREATE INDEX "BonusProposal_targetProfileId_idx" ON "BonusProposal"("targetProfileId");
ALTER TABLE "BonusProposal" ADD CONSTRAINT "BonusProposal_targetProfileId_fkey" FOREIGN KEY ("targetProfileId") REFERENCES "WorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BonusProposal" ADD CONSTRAINT "BonusProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "WorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AIProvisioningRequest
CREATE TABLE "AIProvisioningRequest" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "requestedById"    TEXT NOT NULL,
    "workerType"       "WorkerType" NOT NULL DEFAULT 'AI_AGENT',
    "proposedName"     TEXT NOT NULL,
    "proposedRole"     TEXT NOT NULL,
    "proposedDept"     TEXT,
    "aiModel"          TEXT NOT NULL,
    "aiProvider"       TEXT NOT NULL,
    "aiSystemRole"     TEXT NOT NULL,
    "aiCapabilities"   JSONB NOT NULL DEFAULT '[]',
    "aiTools"          JSONB NOT NULL DEFAULT '[]',
    "autonomyLevel"    "AutonomyLevel" NOT NULL DEFAULT 'MANUAL',
    "budgetLimit"      INTEGER,
    "managerId"        TEXT,
    "status"           "AIProvisioningStatus" NOT NULL DEFAULT 'PROPOSAL',
    "approvalId"       TEXT,
    "approvedById"     TEXT,
    "approvedAt"       TIMESTAMP(3),
    "resultEmployeeId" TEXT,
    "rejectedReason"   TEXT,
    "idempotencyKey"   TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIProvisioningRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AIProvisioningRequest_idempotencyKey_key" ON "AIProvisioningRequest"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "AIProvisioningRequest_companyId_status_idx" ON "AIProvisioningRequest"("companyId", "status");
ALTER TABLE "AIProvisioningRequest" ADD CONSTRAINT "AIProvisioningRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WorkforcePlan
CREATE TABLE "WorkforcePlan" (
    "id"                     TEXT NOT NULL,
    "companyId"              TEXT NOT NULL,
    "title"                  TEXT NOT NULL,
    "period"                 TEXT NOT NULL,
    "requestedById"          TEXT NOT NULL,
    "status"                 "WorkforcePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedHeadcount"       INTEGER NOT NULL DEFAULT 0,
    "currentHeadcount"       INTEGER NOT NULL DEFAULT 0,
    "aiWorkerCount"          INTEGER NOT NULL DEFAULT 0,
    "humanWorkerCount"       INTEGER NOT NULL DEFAULT 0,
    "projectedCostAC"        INTEGER NOT NULL DEFAULT 0,
    "skillGaps"              JSONB NOT NULL DEFAULT '[]',
    "hiringRecommendations"  JSONB NOT NULL DEFAULT '[]',
    "departmentBreakdown"    JSONB NOT NULL DEFAULT '[]',
    "isAdvisory"             BOOLEAN NOT NULL DEFAULT true,
    "approvedById"           TEXT,
    "approvedAt"             TIMESTAMP(3),
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforcePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkforcePlan_companyId_status_idx" ON "WorkforcePlan"("companyId", "status");
ALTER TABLE "WorkforcePlan" ADD CONSTRAINT "WorkforcePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WorkforceAuditEvent
CREATE TABLE "WorkforceAuditEvent" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    "actorId"    TEXT NOT NULL,
    "actorType"  TEXT NOT NULL DEFAULT 'HUMAN',
    "action"     TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId"   TEXT NOT NULL,
    "oldValue"   JSONB,
    "newValue"   JSONB,
    "outcome"    TEXT NOT NULL DEFAULT 'SUCCESS',
    "reference"  TEXT,
    "timestamp"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforceAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkforceAuditEvent_companyId_objectType_objectId_idx" ON "WorkforceAuditEvent"("companyId", "objectType", "objectId");
CREATE INDEX "WorkforceAuditEvent_companyId_timestamp_idx" ON "WorkforceAuditEvent"("companyId", "timestamp");
ALTER TABLE "WorkforceAuditEvent" ADD CONSTRAINT "WorkforceAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
