-- V18 Phase 1: Telemetry, Probing & Infrastructure Metrics Foundation
-- SystemHealthProbe & HealthProbeObservation canonical additions

-- CreateEnum: ProbeTargetType
DO $$ BEGIN
    CREATE TYPE "ProbeTargetType" AS ENUM (
        'DATABASE_POOL',
        'PROCESS_MEMORY',
        'EVENT_LOOP_LAG',
        'BACKGROUND_QUEUE',
        'MODEL_GATEWAY',
        'EXTERNAL_API'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ProbeResultStatus
DO $$ BEGIN
    CREATE TYPE "ProbeResultStatus" AS ENUM (
        'HEALTHY',
        'DEGRADED',
        'UNHEALTHY',
        'TIMEOUT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: SystemHealthProbe
CREATE TABLE IF NOT EXISTS "SystemHealthProbe" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "targetType" "ProbeTargetType" NOT NULL,
    "targetName" TEXT NOT NULL,
    "description" TEXT,
    "endpoint" TEXT,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "failureThreshold" INTEGER NOT NULL DEFAULT 3,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "lastStatus" "ProbeResultStatus" NOT NULL DEFAULT 'HEALTHY',
    "lastObservedAt" TIMESTAMP(3),
    "lastLatencyMs" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemHealthProbe_pkey" PRIMARY KEY ("id")
);

-- CreateTable: HealthProbeObservation
CREATE TABLE IF NOT EXISTS "HealthProbeObservation" (
    "id" TEXT NOT NULL,
    "probeId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "ProbeResultStatus" NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,

    CONSTRAINT "HealthProbeObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SystemHealthProbe_companyId_targetType_idx" ON "SystemHealthProbe"("companyId", "targetType");
CREATE INDEX IF NOT EXISTS "SystemHealthProbe_lastStatus_idx" ON "SystemHealthProbe"("lastStatus");
CREATE INDEX IF NOT EXISTS "SystemHealthProbe_isActive_targetType_idx" ON "SystemHealthProbe"("isActive", "targetType");

CREATE INDEX IF NOT EXISTS "HealthProbeObservation_probeId_observedAt_idx" ON "HealthProbeObservation"("probeId", "observedAt");
CREATE INDEX IF NOT EXISTS "HealthProbeObservation_companyId_observedAt_idx" ON "HealthProbeObservation"("companyId", "observedAt");
CREATE INDEX IF NOT EXISTS "HealthProbeObservation_isProtected_observedAt_idx" ON "HealthProbeObservation"("isProtected", "observedAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "HealthProbeObservation" ADD CONSTRAINT "HealthProbeObservation_probeId_fkey" FOREIGN KEY ("probeId") REFERENCES "SystemHealthProbe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
