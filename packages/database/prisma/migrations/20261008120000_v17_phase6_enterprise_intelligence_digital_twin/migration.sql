-- V17 Phase 6: Enterprise Intelligence & Digital Twin Migration

-- 1. Create DigitalTwinScenario table
CREATE TABLE IF NOT EXISTS "DigitalTwinScenario" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baselineSnapshot" JSONB NOT NULL DEFAULT '{}',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "hypotheticalChanges" JSONB NOT NULL DEFAULT '[]',
    "projectedOutcomes" JSONB NOT NULL DEFAULT '[]',
    "consequenceReport" JSONB NOT NULL DEFAULT '{}',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "uncertaintyNotes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "isPromotionAttempt" BOOLEAN NOT NULL DEFAULT false,
    "promotionRejectionReason" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalTwinScenario_pkey" PRIMARY KEY ("id")
);

-- 2. Create EnterpriseStateRecord table
CREATE TABLE IF NOT EXISTS "EnterpriseStateRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "streamKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "stateKey" TEXT NOT NULL,
    "stateValue" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "epistemicStatus" "EpistemicCertainty" NOT NULL DEFAULT 'FACT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "evidenceRecordId" TEXT,
    "authorityProofId" TEXT,
    "attemptId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "freshnessWindowMs" INTEGER,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "isConflicted" BOOLEAN NOT NULL DEFAULT false,
    "conflictReason" TEXT,
    "supersedesId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "scenarioId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseStateRecord_pkey" PRIMARY KEY ("id")
);

-- 3. Create EnterpriseStateConflict table
CREATE TABLE IF NOT EXISTS "EnterpriseStateConflict" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "primaryStateId" TEXT,
    "secondaryStateId" TEXT,
    "conflictType" TEXT NOT NULL,
    "primarySource" TEXT NOT NULL,
    "primaryValue" JSONB NOT NULL,
    "secondarySource" TEXT NOT NULL,
    "secondaryValue" JSONB NOT NULL,
    "resolutionStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionRationale" TEXT,
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "escalatedToChairman" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,
    "causationId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseStateConflict_pkey" PRIMARY KEY ("id")
);

-- 4. Create EnterpriseIntegrityFinding table
CREATE TABLE IF NOT EXISTS "EnterpriseIntegrityFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNotes" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseIntegrityFinding_pkey" PRIMARY KEY ("id")
);

-- 5. Create EnterpriseStateHealth table
CREATE TABLE IF NOT EXISTS "EnterpriseStateHealth" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "conflictRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "unknownRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "staleMaterialStateRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "provenanceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reconciliationLagMs" INTEGER NOT NULL DEFAULT 0,
    "openIntegrityFindings" INTEGER NOT NULL DEFAULT 0,
    "simulationLeakageViolations" INTEGER NOT NULL DEFAULT 0,
    "crossCompanyIsolationViolations" INTEGER NOT NULL DEFAULT 0,
    "unresolvedMaterialConflicts" INTEGER NOT NULL DEFAULT 0,
    "healthTier" TEXT NOT NULL DEFAULT 'HEALTHY',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseStateHealth_pkey" PRIMARY KEY ("id")
);

-- 6. Create EnterprisePlanChangeRecord table
CREATE TABLE IF NOT EXISTS "EnterprisePlanChangeRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "affectedEntityTypes" JSONB NOT NULL DEFAULT '[]',
    "affectedEntityIds" JSONB NOT NULL DEFAULT '[]',
    "planModifications" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "authorityProofId" TEXT,
    "isThrottled" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,
    "causationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterprisePlanChangeRecord_pkey" PRIMARY KEY ("id")
);

-- 7. Create Indexes
CREATE INDEX IF NOT EXISTS "DigitalTwinScenario_companyId_status_idx" ON "DigitalTwinScenario"("companyId", "status");
CREATE INDEX IF NOT EXISTS "DigitalTwinScenario_companyId_expiresAt_idx" ON "DigitalTwinScenario"("companyId", "expiresAt");

CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_companyId_isCurrent_entityType_entityId_idx" ON "EnterpriseStateRecord"("companyId", "isCurrent", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_companyId_streamKey_isCurrent_idx" ON "EnterpriseStateRecord"("companyId", "streamKey", "isCurrent");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_companyId_isSimulation_idx" ON "EnterpriseStateRecord"("companyId", "isSimulation");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_companyId_observedAt_idx" ON "EnterpriseStateRecord"("companyId", "observedAt");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_supersedesId_idx" ON "EnterpriseStateRecord"("supersedesId");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_evidenceRecordId_idx" ON "EnterpriseStateRecord"("evidenceRecordId");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_authorityProofId_idx" ON "EnterpriseStateRecord"("authorityProofId");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_attemptId_idx" ON "EnterpriseStateRecord"("attemptId");
CREATE INDEX IF NOT EXISTS "EnterpriseStateRecord_scenarioId_idx" ON "EnterpriseStateRecord"("scenarioId");

CREATE INDEX IF NOT EXISTS "EnterpriseStateConflict_companyId_resolutionStatus_idx" ON "EnterpriseStateConflict"("companyId", "resolutionStatus");
CREATE INDEX IF NOT EXISTS "EnterpriseStateConflict_companyId_entityType_entityId_idx" ON "EnterpriseStateConflict"("companyId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "EnterpriseIntegrityFinding_companyId_status_idx" ON "EnterpriseIntegrityFinding"("companyId", "status");
CREATE INDEX IF NOT EXISTS "EnterpriseIntegrityFinding_companyId_findingType_idx" ON "EnterpriseIntegrityFinding"("companyId", "findingType");

CREATE INDEX IF NOT EXISTS "EnterpriseStateHealth_companyId_computedAt_idx" ON "EnterpriseStateHealth"("companyId", "computedAt");

CREATE INDEX IF NOT EXISTS "EnterprisePlanChangeRecord_companyId_deduplicationKey_idx" ON "EnterprisePlanChangeRecord"("companyId", "deduplicationKey");
CREATE INDEX IF NOT EXISTS "EnterprisePlanChangeRecord_companyId_createdAt_idx" ON "EnterprisePlanChangeRecord"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterprisePlanChangeRecord_authorityProofId_idx" ON "EnterprisePlanChangeRecord"("authorityProofId");

-- 8. Add Foreign Keys
DO $$ BEGIN
    ALTER TABLE "DigitalTwinScenario" ADD CONSTRAINT "DigitalTwinScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateRecord" ADD CONSTRAINT "EnterpriseStateRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateRecord" ADD CONSTRAINT "EnterpriseStateRecord_evidenceRecordId_fkey" FOREIGN KEY ("evidenceRecordId") REFERENCES "TaskEvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateRecord" ADD CONSTRAINT "EnterpriseStateRecord_authorityProofId_fkey" FOREIGN KEY ("authorityProofId") REFERENCES "AuthorityProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateRecord" ADD CONSTRAINT "EnterpriseStateRecord_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TaskExecutionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateRecord" ADD CONSTRAINT "EnterpriseStateRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EnterpriseStateRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateRecord" ADD CONSTRAINT "EnterpriseStateRecord_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "DigitalTwinScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateConflict" ADD CONSTRAINT "EnterpriseStateConflict_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseIntegrityFinding" ADD CONSTRAINT "EnterpriseIntegrityFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterpriseStateHealth" ADD CONSTRAINT "EnterpriseStateHealth_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterprisePlanChangeRecord" ADD CONSTRAINT "EnterprisePlanChangeRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EnterprisePlanChangeRecord" ADD CONSTRAINT "EnterprisePlanChangeRecord_authorityProofId_fkey" FOREIGN KEY ("authorityProofId") REFERENCES "AuthorityProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
