-- V17 Phase 3: Reliable Execution & Failure Intelligence Migration

-- 1. Alter Enum AttemptFailureType to add new types
ALTER TYPE "AttemptFailureType" ADD VALUE IF NOT EXISTS 'DEPENDENCY_FAILURE';
ALTER TYPE "AttemptFailureType" ADD VALUE IF NOT EXISTS 'VALIDATION_FAILURE';
ALTER TYPE "AttemptFailureType" ADD VALUE IF NOT EXISTS 'RESOURCE_EXHAUSTION';
ALTER TYPE "AttemptFailureType" ADD VALUE IF NOT EXISTS 'EXTERNAL_ACTION_FAILURE';
ALTER TYPE "AttemptFailureType" ADD VALUE IF NOT EXISTS 'CONFLICT';

-- 2. Alter Task table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastFailureType" "AttemptFailureType";
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recoveryState" TEXT DEFAULT 'NORMAL';

-- 3. Alter TaskExecutionAttempt table
ALTER TABLE "TaskExecutionAttempt" ADD COLUMN IF NOT EXISTS "failureMetadata" JSONB NOT NULL DEFAULT '{}';

-- 4. Convert (taskId, attemptNumber) from normal index to UNIQUE index
DROP INDEX IF EXISTS "TaskExecutionAttempt_taskId_attemptNumber_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "TaskExecutionAttempt_taskId_attemptNumber_key" ON "TaskExecutionAttempt"("taskId", "attemptNumber");
