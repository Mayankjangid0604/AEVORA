-- V18 Phase 2.1: Concurrency Repair
-- Partial unique index for active incident deduplication
-- Enforces database-level uniqueness only while an incident is active.
-- Resolved and closed incidents remain eligible for future new incidents.

CREATE UNIQUE INDEX IF NOT EXISTS "SystemIncident_dedup_active_unique_idx"
ON "SystemIncident"("deduplicationKey")
WHERE "status" NOT IN ('RESOLVED'::"IncidentStatus", 'CLOSED'::"IncidentStatus");

-- Index on taskId to optimize task linkage checks and conditional lookups
CREATE INDEX IF NOT EXISTS "SystemIncident_taskId_idx"
ON "SystemIncident"("taskId");
