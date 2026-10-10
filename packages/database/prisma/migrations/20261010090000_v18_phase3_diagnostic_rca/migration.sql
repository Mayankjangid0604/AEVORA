-- V18 Phase 3: Diagnostic Context Assembly & Automated Root Cause Analysis
-- IncidentDiagnosticReport model and DiagnosticReportStatus additions

-- AlterEnum: IncidentEventType
DO $$ BEGIN
    ALTER TYPE "IncidentEventType" ADD VALUE 'DIAGNOSTIC_REPORT_ATTACHED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: DiagnosticReportStatus
DO $$ BEGIN
    CREATE TYPE "DiagnosticReportStatus" AS ENUM (
        'COMPLETED',
        'INCONCLUSIVE',
        'FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: IncidentDiagnosticReport
CREATE TABLE IF NOT EXISTS "IncidentDiagnosticReport" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "DiagnosticReportStatus" NOT NULL DEFAULT 'COMPLETED',
    "diagnosticContext" JSONB NOT NULL,
    "rankedHypotheses" JSONB NOT NULL,
    "evidenceGaps" JSONB NOT NULL DEFAULT '[]',
    "contradictions" JSONB NOT NULL DEFAULT '[]',
    "recommendedAction" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "isInconclusive" BOOLEAN NOT NULL DEFAULT false,
    "inconclusiveReason" TEXT,
    "analyzedBy" TEXT NOT NULL DEFAULT 'SYSTEM_DIAGNOSTIC_ENGINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentDiagnosticReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IncidentDiagnosticReport_incidentId_createdAt_idx" ON "IncidentDiagnosticReport"("incidentId", "createdAt");
CREATE INDEX IF NOT EXISTS "IncidentDiagnosticReport_companyId_createdAt_idx" ON "IncidentDiagnosticReport"("companyId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "IncidentDiagnosticReport" ADD CONSTRAINT "IncidentDiagnosticReport_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SystemIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
