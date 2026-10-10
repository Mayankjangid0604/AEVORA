-- V18 Phase 2: Incident Management, Anomaly Detection & Triage
-- SystemIncident & IncidentTimelineEvent additions

-- CreateEnum: IncidentSeverity
DO $$ BEGIN
    CREATE TYPE "IncidentSeverity" AS ENUM (
        'SEV1_CRITICAL',
        'SEV2_HIGH',
        'SEV3_MEDIUM',
        'SEV4_LOW'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: IncidentStatus
DO $$ BEGIN
    CREATE TYPE "IncidentStatus" AS ENUM (
        'DETECTED',
        'TRIAGED',
        'INVESTIGATING',
        'MITIGATED',
        'RESOLVED',
        'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: IncidentEventType
DO $$ BEGIN
    CREATE TYPE "IncidentEventType" AS ENUM (
        'STATUS_CHANGE',
        'SEVERITY_UPDATE',
        'TRIAGE_NOTE',
        'ESCALATION',
        'EVIDENCE_ATTACHED',
        'TASK_LINKED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: SystemIncident
CREATE TABLE IF NOT EXISTS "SystemIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'SEV3_MEDIUM',
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "targetType" "ProbeTargetType" NOT NULL,
    "targetName" TEXT NOT NULL,
    "detectionSource" TEXT NOT NULL DEFAULT 'HEALTH_PROBE_ANOMALY_DETECTOR',
    "deduplicationKey" TEXT NOT NULL,
    "correlationId" TEXT,
    "causationId" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "triageSummary" TEXT,
    "hypotheses" JSONB NOT NULL DEFAULT '[]',
    "affectedServices" JSONB NOT NULL DEFAULT '[]',
    "taskId" TEXT,
    "escalationRequired" BOOLEAN NOT NULL DEFAULT false,
    "escalatedTo" TEXT,
    "mitigatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IncidentTimelineEvent
CREATE TABLE IF NOT EXISTS "IncidentTimelineEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "companyId" TEXT,
    "eventType" "IncidentEventType" NOT NULL,
    "fromStatus" "IncidentStatus",
    "toStatus" "IncidentStatus",
    "note" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SystemIncident_companyId_status_idx" ON "SystemIncident"("companyId", "status");
CREATE INDEX IF NOT EXISTS "SystemIncident_companyId_severity_idx" ON "SystemIncident"("companyId", "severity");
CREATE INDEX IF NOT EXISTS "SystemIncident_deduplicationKey_status_idx" ON "SystemIncident"("deduplicationKey", "status");
CREATE INDEX IF NOT EXISTS "SystemIncident_createdAt_idx" ON "SystemIncident"("createdAt");

CREATE INDEX IF NOT EXISTS "IncidentTimelineEvent_incidentId_createdAt_idx" ON "IncidentTimelineEvent"("incidentId", "createdAt");
CREATE INDEX IF NOT EXISTS "IncidentTimelineEvent_companyId_createdAt_idx" ON "IncidentTimelineEvent"("companyId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "IncidentTimelineEvent" ADD CONSTRAINT "IncidentTimelineEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SystemIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
