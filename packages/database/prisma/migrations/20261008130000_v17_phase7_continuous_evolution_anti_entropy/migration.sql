-- V17 Phase 7: Continuous Evolution & Anti-Entropy Migration

-- 0. Create ImprovementStatus Enum & Base Tables if not exist
DO $$ BEGIN
    CREATE TYPE "ImprovementStatus" AS ENUM (
        'DETECTED', 'DRAFT', 'PROPOSED', 'UNDER_REVIEW', 'APPROVED',
        'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ImprovementProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "observedSignal" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "proposedChange" TEXT NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "expectedMetric" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "risk" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ImprovementStatus" NOT NULL DEFAULT 'DETECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "ImprovementProposal_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "ImprovementProposal" ADD CONSTRAINT "ImprovementProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ImprovementOutcome" (
    "id" TEXT NOT NULL,
    "improvementProposalId" TEXT NOT NULL,
    "measurementWindow" TEXT NOT NULL,
    "actualResult" DOUBLE PRECISION NOT NULL,
    "comparison" TEXT NOT NULL,
    "learnedLesson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementOutcome_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "ImprovementOutcome" ADD CONSTRAINT "ImprovementOutcome_improvementProposalId_fkey" FOREIGN KEY ("improvementProposalId") REFERENCES "ImprovementProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Extend ImprovementProposal table with Phase 7 Governance & Validation Fields
ALTER TABLE "ImprovementProposal"
ADD COLUMN IF NOT EXISTS "targetDomain" TEXT,
ADD COLUMN IF NOT EXISTS "reversibility" TEXT DEFAULT 'REVERSIBLE',
ADD COLUMN IF NOT EXISTS "blastRadius" TEXT DEFAULT 'LOCAL',
ADD COLUMN IF NOT EXISTS "validationCriteria" JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "rollbackCriteria" JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "simulationRequirement" TEXT DEFAULT 'OPTIONAL',
ADD COLUMN IF NOT EXISTS "authorityRequirement" TEXT DEFAULT 'GOVERNED_DELEGATION',
ADD COLUMN IF NOT EXISTS "simulationScenarioId" TEXT,
ADD COLUMN IF NOT EXISTS "simulationEvaluated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "authorityProofId" TEXT,
ADD COLUMN IF NOT EXISTS "validationStatus" TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "validationObservedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "validationEvidence" JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "rollbackReason" TEXT,
ADD COLUMN IF NOT EXISTS "rollbackEvidence" JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "supersedesId" TEXT,
ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
ADD COLUMN IF NOT EXISTS "causationId" TEXT;

CREATE INDEX IF NOT EXISTS "ImprovementProposal_companyId_status_idx" ON "ImprovementProposal"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImprovementProposal_companyId_targetDomain_idx" ON "ImprovementProposal"("companyId", "targetDomain");
CREATE INDEX IF NOT EXISTS "ImprovementProposal_companyId_createdAt_idx" ON "ImprovementProposal"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImprovementOutcome_improvementProposalId_idx" ON "ImprovementOutcome"("improvementProposalId");

-- 2. Create EntropyFinding table
CREATE TABLE IF NOT EXISTS "EntropyFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detectionSource" TEXT NOT NULL,
    "affectedEntity" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "recommendedAction" TEXT NOT NULL,
    "autoRemediable" BOOLEAN NOT NULL DEFAULT false,
    "authorityRequirement" TEXT NOT NULL DEFAULT 'AUTO_SAFE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "remediatedAt" TIMESTAMP(3),
    "remediatedBy" TEXT,
    "remediationDetails" JSONB DEFAULT '{}',
    "correlationId" TEXT,
    "causationId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntropyFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntropyFinding_companyId_status_idx" ON "EntropyFinding"("companyId", "status");
CREATE INDEX IF NOT EXISTS "EntropyFinding_companyId_category_idx" ON "EntropyFinding"("companyId", "category");
CREATE INDEX IF NOT EXISTS "EntropyFinding_companyId_severity_idx" ON "EntropyFinding"("companyId", "severity");

ALTER TABLE "EntropyFinding"
ADD CONSTRAINT "EntropyFinding_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Create EntropyHealthSnapshot table
CREATE TABLE IF NOT EXISTS "EntropyHealthSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "architectureEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "dataEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "governanceEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "executionEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "organizationalEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "knowledgeEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "simulationEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalEntropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "criticalFindingCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedFindingCount" INTEGER NOT NULL DEFAULT 0,
    "autoRemediationSuccessRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "remediationRecurrenceRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "healthTier" TEXT NOT NULL DEFAULT 'HEALTHY',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntropyHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntropyHealthSnapshot_companyId_computedAt_idx" ON "EntropyHealthSnapshot"("companyId", "computedAt");

ALTER TABLE "EntropyHealthSnapshot"
ADD CONSTRAINT "EntropyHealthSnapshot_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Create EntropyRemediationRecord table
CREATE TABLE IF NOT EXISTS "EntropyRemediationRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "findingCategory" TEXT NOT NULL,
    "remediationAction" TEXT NOT NULL,
    "remediationTier" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB NOT NULL DEFAULT '{}',
    "performedBy" TEXT NOT NULL,
    "authorityProofId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "remediatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntropyRemediationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntropyRemediationRecord_companyId_findingCategory_idx" ON "EntropyRemediationRecord"("companyId", "findingCategory");
CREATE INDEX IF NOT EXISTS "EntropyRemediationRecord_companyId_remediatedAt_idx" ON "EntropyRemediationRecord"("companyId", "remediatedAt");

ALTER TABLE "EntropyRemediationRecord"
ADD CONSTRAINT "EntropyRemediationRecord_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
