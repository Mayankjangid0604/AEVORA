-- V18 Phase 4: Runbook Engine & Governed Remediation Execution
-- RunbookDefinition, RunbookExecution models and related enums

-- AlterEnum: IncidentEventType
DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'REMEDIATION_PLANNED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'REMEDIATION_STARTED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'REMEDIATION_COMPLETED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'REMEDIATION_VERIFIED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'REMEDIATION_FAILED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'REMEDIATION_ROLLED_BACK';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: RunbookActionType
DO $$ BEGIN
    CREATE TYPE "RunbookActionType" AS ENUM (
        'SERVICE_RESTART',
        'CONNECTION_POOL_REBALANCE',
        'QUEUE_PURGE_STALE_LOCKS',
        'CACHE_INVALIDATION',
        'TRAFFIC_THROTTLE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: RunbookRiskTier
DO $$ BEGIN
    CREATE TYPE "RunbookRiskTier" AS ENUM (
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: RunbookExecutionStatus
DO $$ BEGIN
    CREATE TYPE "RunbookExecutionStatus" AS ENUM (
        'PENDING_APPROVAL',
        'APPROVED',
        'EXECUTING',
        'COMPLETED',
        'VERIFYING',
        'VERIFIED_HEALTHY',
        'FAILED',
        'ROLLED_BACK',
        'ROLLBACK_FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: RunbookDefinition
CREATE TABLE IF NOT EXISTS "RunbookDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetType" "ProbeTargetType" NOT NULL,
    "actionType" "RunbookActionType" NOT NULL,
    "riskTier" "RunbookRiskTier" NOT NULL DEFAULT 'LOW',
    "isReversible" BOOLEAN NOT NULL DEFAULT true,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "preconditions" JSONB NOT NULL DEFAULT '[]',
    "postVerificationCriteria" JSONB NOT NULL DEFAULT '{}',
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunbookDefinition_pkey" PRIMARY KEY ("id")
);

-- Seed Canonical Built-In Runbook Definitions (Referential Integrity Guarantee)
INSERT INTO "RunbookDefinition" (
    "id", "companyId", "name", "description", "targetType", "actionType",
    "riskTier", "isReversible", "parameters", "preconditions", "postVerificationCriteria",
    "maxAttempts", "cooldownMinutes", "isActive", "createdAt", "updatedAt"
) VALUES
(
    'builtin-db-pool-rebalance', NULL, 'Database Connection Pool Rebalance',
    'Safely evicts idle database connections and rebalances connection pool under high query latency.',
    'DATABASE_POOL', 'CONNECTION_POOL_REBALANCE', 'MEDIUM', true,
    '{"maxConnections": 20}'::jsonb,
    '[{"metric": "status", "operator": "NOT_EQUALS", "expectedValue": "HEALTHY", "description": "Pool must be DEGRADED or UNHEALTHY"}]'::jsonb,
    '{"expectedStatus": "HEALTHY"}'::jsonb,
    2, 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    'builtin-queue-purge-locks', NULL, 'Background Queue Stale Lock Reclaim',
    'Reclaims abandoned job claim locks older than threshold without deleting jobs.',
    'BACKGROUND_QUEUE', 'QUEUE_PURGE_STALE_LOCKS', 'LOW', true,
    '{"staleThresholdMinutes": 5, "maxReclaimed": 50}'::jsonb,
    '[{"metric": "status", "operator": "NOT_EQUALS", "expectedValue": "HEALTHY", "description": "Queue must be degraded"}]'::jsonb,
    '{"expectedStatus": "HEALTHY"}'::jsonb,
    3, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    'builtin-memory-worker-recycle', NULL, 'Worker Process Memory Recycle',
    'Gracefully drains inflight requests and recycles the worker process to recover heap limits.',
    'PROCESS_MEMORY', 'SERVICE_RESTART', 'HIGH', true,
    '{"drainTimeoutMs": 5000}'::jsonb,
    '[{"metric": "heapUsageRatio", "operator": "GREATER_THAN", "expectedValue": 0.85, "description": "Heap ratio must exceed 85%"}]'::jsonb,
    '{"expectedStatus": "HEALTHY"}'::jsonb,
    2, 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    'builtin-event-loop-throttle', NULL, 'Event Loop Concurrency Throttle',
    'Applies temporary concurrency backpressure to alleviate CPU starvation on event loop.',
    'EVENT_LOOP_LAG', 'TRAFFIC_THROTTLE', 'MEDIUM', true,
    '{"rateLimit": 100, "durationSeconds": 60}'::jsonb,
    '[{"metric": "lagMs", "operator": "GREATER_THAN", "expectedValue": 50, "description": "Lag must exceed 50ms"}]'::jsonb,
    '{"expectedStatus": "HEALTHY"}'::jsonb,
    2, 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    'builtin-model-gateway-cache-flush', NULL, 'Model Gateway Inference Cache Flush',
    'Evicts corrupt or stale model provider response caches.',
    'MODEL_GATEWAY', 'CACHE_INVALIDATION', 'LOW', true,
    '{"maxKeys": 100}'::jsonb,
    '[]'::jsonb,
    '{"expectedStatus": "HEALTHY"}'::jsonb,
    2, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- CreateTable: RunbookExecution
CREATE TABLE IF NOT EXISTS "RunbookExecution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "incidentId" TEXT NOT NULL,
    "runbookId" TEXT NOT NULL,
    "actionType" "RunbookActionType" NOT NULL,
    "status" "RunbookExecutionStatus" NOT NULL DEFAULT 'EXECUTING',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "preExecutionSnapshot" JSONB NOT NULL DEFAULT '{}',
    "stepResults" JSONB NOT NULL DEFAULT '[]',
    "postVerificationSnapshot" JSONB NOT NULL DEFAULT '{}',
    "rollbackResults" JSONB NOT NULL DEFAULT '{}',
    "riskTier" "RunbookRiskTier" NOT NULL,
    "approvalRequestId" TEXT,
    "executedBy" TEXT NOT NULL DEFAULT 'SYSTEM_SELF_HEALING_ENGINE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunbookExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes: RunbookDefinition
CREATE INDEX IF NOT EXISTS "RunbookDefinition_companyId_targetType_idx" ON "RunbookDefinition"("companyId", "targetType");
CREATE INDEX IF NOT EXISTS "RunbookDefinition_actionType_idx" ON "RunbookDefinition"("actionType");

-- CreateIndexes: RunbookExecution
CREATE INDEX IF NOT EXISTS "RunbookExecution_incidentId_createdAt_idx" ON "RunbookExecution"("incidentId", "createdAt");
CREATE INDEX IF NOT EXISTS "RunbookExecution_companyId_status_idx" ON "RunbookExecution"("companyId", "status");

-- AddForeignKeys
DO $$ BEGIN
    ALTER TABLE "RunbookExecution" ADD CONSTRAINT "RunbookExecution_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SystemIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "RunbookExecution" ADD CONSTRAINT "RunbookExecution_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "RunbookDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ApprovalRequest" ALTER COLUMN "companyId" DROP NOT NULL;
EXCEPTION
    WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ApprovalRequest" ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "RunbookExecution" ADD CONSTRAINT "RunbookExecution_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
