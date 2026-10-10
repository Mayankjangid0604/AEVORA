-- V17 Phase 4: Evidence & Outcomes Verification Migration

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "EvidenceNature" AS ENUM ('RAW', 'DERIVED', 'AI_INFERENCE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "EpistemicCertainty" AS ENUM ('FACT', 'VERIFIED_FACT', 'DERIVED_FACT', 'INFERENCE', 'HYPOTHESIS', 'UNKNOWN', 'CONFLICTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "EvidenceVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CONFLICTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "OutcomeVerificationStatus" AS ENUM ('AUTHORIZED', 'EXECUTED', 'TECHNICALLY_COMPLETED', 'EVIDENCE_VERIFIED', 'OUTCOME_VERIFIED', 'STRATEGICALLY_SUCCESSFUL', 'SUSTAINABLE', 'OUTCOME_FAILED', 'REOPENED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter Task Table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "outcomeState" "OutcomeVerificationStatus" DEFAULT 'AUTHORIZED';
CREATE INDEX IF NOT EXISTS "Task_outcomeState_idx" ON "Task"("outcomeState");

-- 3. Alter TaskResult Table
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

ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "outcomeState" "OutcomeVerificationStatus" NOT NULL DEFAULT 'TECHNICALLY_COMPLETED';
ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "epistemicStatus" "EpistemicCertainty" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "verificationScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "outcomeConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "evidenceSummary" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "TaskResult" ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT;

-- 4. Create TaskEvidenceRecord Table
CREATE TABLE IF NOT EXISTS "TaskEvidenceRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptId" TEXT,
    "nature" "EvidenceNature" NOT NULL DEFAULT 'RAW',
    "epistemicStatus" "EpistemicCertainty" NOT NULL DEFAULT 'UNKNOWN',
    "verificationStatus" "EvidenceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidenceType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "integrityMetadata" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isIndependent" BOOLEAN NOT NULL DEFAULT false,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verificationNotes" TEXT,
    "supersedesId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- 5. Add Foreign Keys for TaskEvidenceRecord
DO $$ BEGIN
    ALTER TABLE "TaskEvidenceRecord" ADD CONSTRAINT "TaskEvidenceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TaskEvidenceRecord" ADD CONSTRAINT "TaskEvidenceRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TaskEvidenceRecord" ADD CONSTRAINT "TaskEvidenceRecord_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TaskExecutionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TaskEvidenceRecord" ADD CONSTRAINT "TaskEvidenceRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TaskEvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 6. Indexes for TaskEvidenceRecord
CREATE INDEX IF NOT EXISTS "TaskEvidenceRecord_companyId_taskId_idx" ON "TaskEvidenceRecord"("companyId", "taskId");
CREATE INDEX IF NOT EXISTS "TaskEvidenceRecord_companyId_contentHash_idx" ON "TaskEvidenceRecord"("companyId", "contentHash");
CREATE INDEX IF NOT EXISTS "TaskEvidenceRecord_attemptId_idx" ON "TaskEvidenceRecord"("attemptId");
CREATE INDEX IF NOT EXISTS "TaskEvidenceRecord_verificationStatus_idx" ON "TaskEvidenceRecord"("verificationStatus");
CREATE INDEX IF NOT EXISTS "TaskEvidenceRecord_epistemicStatus_idx" ON "TaskEvidenceRecord"("epistemicStatus");
