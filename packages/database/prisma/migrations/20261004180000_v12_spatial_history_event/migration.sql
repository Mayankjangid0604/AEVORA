-- CreateTable
CREATE TABLE "V12SpatialHistoryEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "eventType" TEXT NOT NULL,
    "authoritativeTimestamp" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "correlationId" TEXT,
    "causationId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V12SpatialHistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "V12SpatialHistoryEvent_eventId_key" ON "V12SpatialHistoryEvent"("eventId");

-- CreateIndex
CREATE INDEX "V12SpatialHistoryEvent_companyId_authoritativeTimestamp_seq_idx" ON "V12SpatialHistoryEvent"("companyId", "authoritativeTimestamp", "sequence");

-- CreateIndex
CREATE INDEX "V12SpatialHistoryEvent_companyId_entityId_sequence_idx" ON "V12SpatialHistoryEvent"("companyId", "entityId", "sequence");

-- CreateIndex
CREATE INDEX "V12SpatialHistoryEvent_companyId_eventType_sequence_idx" ON "V12SpatialHistoryEvent"("companyId", "eventType", "sequence");

-- CreateIndex
CREATE INDEX "V12SpatialHistoryEvent_companyId_correlationId_idx" ON "V12SpatialHistoryEvent"("companyId", "correlationId");

-- CreateIndex
CREATE INDEX "V12SpatialHistoryEvent_companyId_causationId_idx" ON "V12SpatialHistoryEvent"("companyId", "causationId");

-- CreateIndex
CREATE UNIQUE INDEX "V12SpatialHistoryEvent_companyId_sequence_key" ON "V12SpatialHistoryEvent"("companyId", "sequence");

