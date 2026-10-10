-- V17 Phase 5: Authority Integration & Governance Migration

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "AuthorityTier" AS ENUM ('CHAIRMAN', 'CEO', 'DEPARTMENT_LEADER', 'WORKFORCE_AGENT', 'EPHEMERAL_DELEGATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AuthorityGrantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create AuthorityGrant Table
CREATE TABLE IF NOT EXISTS "AuthorityGrant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "granterId" TEXT NOT NULL,
    "granterRole" TEXT NOT NULL,
    "granterTier" "AuthorityTier" NOT NULL,
    "granteeId" TEXT NOT NULL,
    "granteeRole" TEXT NOT NULL,
    "granteeTier" "AuthorityTier" NOT NULL,
    "capability" TEXT NOT NULL,
    "actionScope" JSONB NOT NULL DEFAULT '[]',
    "resourceScope" JSONB NOT NULL DEFAULT '[]',
    "maxRiskTier" "CeoDecisionRiskLevel" NOT NULL DEFAULT 'LOW',
    "delegationDepth" INTEGER NOT NULL DEFAULT 0,
    "parentGrantId" TEXT,
    "status" "AuthorityGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revocationReason" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "commandId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorityGrant_pkey" PRIMARY KEY ("id")
);

-- 3. Create ChairmanPreference Table
CREATE TABLE IF NOT EXISTS "ChairmanPreference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isBinding" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChairmanPreference_pkey" PRIMARY KEY ("id")
);

-- 4. Create AuthorityProof Table
CREATE TABLE IF NOT EXISTS "AuthorityProof" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorTier" "AuthorityTier" NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetEntity" TEXT,
    "targetId" TEXT,
    "parametersHash" TEXT NOT NULL,
    "authorityGrantId" TEXT,
    "commandId" TEXT,
    "approvalId" TEXT,
    "riskTier" "CeoDecisionRiskLevel" NOT NULL DEFAULT 'LOW',
    "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "delegationChain" JSONB NOT NULL DEFAULT '[]',
    "isAuthorized" BOOLEAN NOT NULL,
    "rejectionReason" TEXT,
    "replayedFromProofId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorityProof_pkey" PRIMARY KEY ("id")
);

-- 5. Create DisagreementRecord Table
CREATE TABLE IF NOT EXISTS "DisagreementRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "ceoId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "chairmanPosition" TEXT NOT NULL,
    "ceoPosition" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "alternativesConsidered" JSONB NOT NULL DEFAULT '[]',
    "councilConsulted" TEXT,
    "councilVotes" JSONB NOT NULL DEFAULT '[]',
    "isCouncilVoteBinding" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolutionDecision" TEXT,
    "finalCommandId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisagreementRecord_pkey" PRIMARY KEY ("id")
);

-- 6. Add Foreign Keys
DO $$ BEGIN
    ALTER TABLE "AuthorityGrant" ADD CONSTRAINT "AuthorityGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AuthorityGrant" ADD CONSTRAINT "AuthorityGrant_parentGrantId_fkey" FOREIGN KEY ("parentGrantId") REFERENCES "AuthorityGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ChairmanPreference" ADD CONSTRAINT "ChairmanPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ChairmanPreference" ADD CONSTRAINT "ChairmanPreference_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Chairman"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AuthorityProof" ADD CONSTRAINT "AuthorityProof_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AuthorityProof" ADD CONSTRAINT "AuthorityProof_authorityGrantId_fkey" FOREIGN KEY ("authorityGrantId") REFERENCES "AuthorityGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "DisagreementRecord" ADD CONSTRAINT "DisagreementRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "DisagreementRecord" ADD CONSTRAINT "DisagreementRecord_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Chairman"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 7. Alter TaskExecutionAttempt & TaskEvidenceRecord
ALTER TABLE "TaskExecutionAttempt" ADD COLUMN IF NOT EXISTS "authorityProofId" TEXT;
DO $$ BEGIN
    ALTER TABLE "TaskExecutionAttempt" ADD CONSTRAINT "TaskExecutionAttempt_authorityProofId_fkey" FOREIGN KEY ("authorityProofId") REFERENCES "AuthorityProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "TaskExecutionAttempt_authorityProofId_idx" ON "TaskExecutionAttempt"("authorityProofId");

ALTER TABLE "TaskEvidenceRecord" ADD COLUMN IF NOT EXISTS "authorityProofId" TEXT;
DO $$ BEGIN
    ALTER TABLE "TaskEvidenceRecord" ADD CONSTRAINT "TaskEvidenceRecord_authorityProofId_fkey" FOREIGN KEY ("authorityProofId") REFERENCES "AuthorityProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "TaskEvidenceRecord_authorityProofId_idx" ON "TaskEvidenceRecord"("authorityProofId");

-- 8. Indexes for Phase 5 Tables
CREATE INDEX IF NOT EXISTS "AuthorityGrant_companyId_granteeId_status_idx" ON "AuthorityGrant"("companyId", "granteeId", "status");
CREATE INDEX IF NOT EXISTS "AuthorityGrant_companyId_capability_idx" ON "AuthorityGrant"("companyId", "capability");
CREATE INDEX IF NOT EXISTS "AuthorityGrant_expiresAt_idx" ON "AuthorityGrant"("expiresAt");
CREATE INDEX IF NOT EXISTS "AuthorityGrant_status_idx" ON "AuthorityGrant"("status");

CREATE INDEX IF NOT EXISTS "ChairmanPreference_companyId_domain_idx" ON "ChairmanPreference"("companyId", "domain");
CREATE INDEX IF NOT EXISTS "ChairmanPreference_chairmanId_idx" ON "ChairmanPreference"("chairmanId");

CREATE INDEX IF NOT EXISTS "AuthorityProof_companyId_actorId_idx" ON "AuthorityProof"("companyId", "actorId");
CREATE INDEX IF NOT EXISTS "AuthorityProof_companyId_actionType_idx" ON "AuthorityProof"("companyId", "actionType");
CREATE INDEX IF NOT EXISTS "AuthorityProof_parametersHash_idx" ON "AuthorityProof"("parametersHash");
CREATE INDEX IF NOT EXISTS "AuthorityProof_authorityGrantId_idx" ON "AuthorityProof"("authorityGrantId");

CREATE INDEX IF NOT EXISTS "DisagreementRecord_companyId_resolved_idx" ON "DisagreementRecord"("companyId", "resolved");
