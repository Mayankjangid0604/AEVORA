-- V17 Phase 2: Department Operating Layer Migration
-- Non-destructive additions: DepartmentWorkstream, DepartmentTeam, DepartmentHealthSnapshot, DepartmentResourceProposal, and Task.workstreamId

-- 1. Create Enums if not exist
DO $$ BEGIN
    CREATE TYPE "WorkstreamStatus" AS ENUM ('PLANNED', 'ACTIVE', 'BLOCKED', 'DEGRADED', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DepartmentTeamStatus" AS ENUM ('FORMING', 'ACTIVE', 'COMPLETED', 'DISSOLVED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ResourceProposalStatus" AS ENUM ('SUBMITTED', 'UNDER_CEO_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'IMPLEMENTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table: DepartmentWorkstream
CREATE TABLE IF NOT EXISTS "DepartmentWorkstream" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "goalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkstreamStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "riskTier" "CeoDecisionRiskLevel" NOT NULL DEFAULT 'LOW',
    "ownerAgentId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentWorkstream_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DepartmentWorkstream_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentWorkstream_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentWorkstream_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 3. Create Table: DepartmentTeam
CREATE TABLE IF NOT EXISTS "DepartmentTeam" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "workstreamId" TEXT,
    "name" TEXT NOT NULL,
    "formationReason" TEXT NOT NULL,
    "expectedOutcome" TEXT,
    "status" "DepartmentTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "leadAgentId" TEXT NOT NULL,
    "memberAgentIds" JSONB NOT NULL DEFAULT '[]',
    "requiredCapabilities" JSONB NOT NULL DEFAULT '[]',
    "authorityScope" JSONB NOT NULL DEFAULT '{}',
    "terminationCondition" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentTeam_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DepartmentTeam_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentTeam_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentTeam_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "DepartmentWorkstream"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. Create Table: DepartmentHealthSnapshot
CREATE TABLE IF NOT EXISTS "DepartmentHealthSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "bottlenecks" JSONB NOT NULL DEFAULT '[]',
    "improvementSignals" JSONB NOT NULL DEFAULT '[]',
    "triggerEvent" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentHealthSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DepartmentHealthSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentHealthSnapshot_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Create Table: DepartmentResourceProposal
CREATE TABLE IF NOT EXISTS "DepartmentResourceProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requestedResource" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expectedOutcome" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
    "cost" INTEGER NOT NULL DEFAULT 0,
    "riskTier" "CeoDecisionRiskLevel" NOT NULL DEFAULT 'LOW',
    "status" "ResourceProposalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "opportunityCost" TEXT,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "expectedDuration" TEXT,
    "successCriteria" JSONB NOT NULL DEFAULT '[]',
    "proposerAgentId" TEXT NOT NULL,
    "reviewerComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentResourceProposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DepartmentResourceProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentResourceProposal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. Add workstreamId to Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workstreamId" TEXT;

DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "DepartmentWorkstream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 7. Create Indexes
CREATE INDEX IF NOT EXISTS "DepartmentWorkstream_companyId_departmentId_idx" ON "DepartmentWorkstream"("companyId", "departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentWorkstream_status_idx" ON "DepartmentWorkstream"("status");
CREATE INDEX IF NOT EXISTS "DepartmentTeam_companyId_departmentId_idx" ON "DepartmentTeam"("companyId", "departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentTeam_status_idx" ON "DepartmentTeam"("status");
CREATE INDEX IF NOT EXISTS "DepartmentHealthSnapshot_companyId_departmentId_timestamp_idx" ON "DepartmentHealthSnapshot"("companyId", "departmentId", "timestamp");
CREATE INDEX IF NOT EXISTS "DepartmentResourceProposal_companyId_departmentId_idx" ON "DepartmentResourceProposal"("companyId", "departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentResourceProposal_status_idx" ON "DepartmentResourceProposal"("status");
