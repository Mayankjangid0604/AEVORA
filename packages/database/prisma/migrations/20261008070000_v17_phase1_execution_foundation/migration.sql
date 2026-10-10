-- V17 Phase 1: Execution Foundation Migration
-- Creates core execution enums, TaskExecutionAttempt entity, CEO decision foundations, and augments Task & Company

-- 1. Create Enums if not exist
DO $$ BEGIN
    CREATE TYPE "ExecutionAttemptStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AttemptFailureType" AS ENUM ('CAPABILITY_FAILURE', 'SAFETY_FAILURE', 'AUTHORITY_FAILURE', 'TRANSIENT', 'TIMEOUT', 'UNEXPECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "EmergencyState" AS ENUM ('NORMAL', 'ELEVATED_CAUTION', 'CONTAINMENT', 'EMERGENCY_STOP');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CeoDecisionCategory" AS ENUM ('OPERATIONS', 'SALES', 'PROJECTS', 'WORKFORCE', 'CUSTOMER', 'FINANCE', 'KPI');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CeoDecisionRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CeoDecisionConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CeoDecisionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NOT_REQUIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CeoDecisionExecutionStatus" AS ENUM ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED_STALE', 'CANCELLED_OVERRIDE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table: TaskExecutionAttempt
CREATE TABLE IF NOT EXISTS "TaskExecutionAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "agentId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ExecutionAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "failureType" "AttemptFailureType",
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "costUnits" INTEGER NOT NULL DEFAULT 0,
    "correlationId" TEXT,
    "causationId" TEXT,

    CONSTRAINT "TaskExecutionAttempt_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys for TaskExecutionAttempt
DO $$ BEGIN
    ALTER TABLE "TaskExecutionAttempt" ADD CONSTRAINT "TaskExecutionAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TaskExecutionAttempt" ADD CONSTRAINT "TaskExecutionAttempt_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TaskExecutionAttempt" ADD CONSTRAINT "TaskExecutionAttempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Indexes for TaskExecutionAttempt
CREATE INDEX IF NOT EXISTS "TaskExecutionAttempt_companyId_status_idx" ON "TaskExecutionAttempt"("companyId", "status");
CREATE INDEX IF NOT EXISTS "TaskExecutionAttempt_workerId_idx" ON "TaskExecutionAttempt"("workerId");
CREATE INDEX IF NOT EXISTS "TaskExecutionAttempt_taskId_attemptNumber_idx" ON "TaskExecutionAttempt"("taskId", "attemptNumber");

-- 3. Create Table: CeoAutonomousDecision
CREATE TABLE IF NOT EXISTS "CeoAutonomousDecision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ceoId" TEXT NOT NULL,
    "category" "CeoDecisionCategory" NOT NULL,
    "triggerType" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "observations" TEXT NOT NULL,
    "reasoningSummary" TEXT NOT NULL,
    "objectiveId" TEXT,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "proposedAction" TEXT NOT NULL,
    "riskLevel" "CeoDecisionRiskLevel" NOT NULL,
    "confidence" "CeoDecisionConfidence" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "CeoDecisionApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "executionStatus" "CeoDecisionExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "executionResult" TEXT,
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CeoAutonomousDecision_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys for CeoAutonomousDecision
DO $$ BEGIN
    ALTER TABLE "CeoAutonomousDecision" ADD CONSTRAINT "CeoAutonomousDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CeoAutonomousDecision" ADD CONSTRAINT "CeoAutonomousDecision_ceoId_fkey" FOREIGN KEY ("ceoId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Indexes for CeoAutonomousDecision
CREATE INDEX IF NOT EXISTS "CeoAutonomousDecision_companyId_idx" ON "CeoAutonomousDecision"("companyId");
CREATE INDEX IF NOT EXISTS "CeoAutonomousDecision_ceoId_idx" ON "CeoAutonomousDecision"("ceoId");

-- 4. Alter Table: Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "claimLockToken" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "claimExpiresAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "causationId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "riskTier" "CeoDecisionRiskLevel" NOT NULL DEFAULT 'LOW';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "qualityGatePassed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "successCriteria" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "evidenceRequirements" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "stopCriteria" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "escalationCriteria" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "maxRetries" INTEGER NOT NULL DEFAULT 3;

-- 5. Alter Table: Company
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "emergencyStatus" "EmergencyState" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "emergencyDeclaredAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "emergencyReason" TEXT;

-- 6. Create Table: TaskResult
CREATE TABLE IF NOT EXISTS "TaskResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "summary" TEXT NOT NULL,
    "output" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskResult_taskId_key" ON "TaskResult"("taskId");

DO $$ BEGIN
    ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
