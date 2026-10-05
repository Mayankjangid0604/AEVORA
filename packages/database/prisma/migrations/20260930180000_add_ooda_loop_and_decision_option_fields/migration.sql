-- DecisionOption: add trade-off fields
ALTER TABLE "DecisionOption" ADD COLUMN "advantages" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DecisionOption" ADD COLUMN "disadvantages" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DecisionOption" ADD COLUMN "risks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DecisionOption" ADD COLUMN "estimatedEffort" TEXT;
ALTER TABLE "DecisionOption" ADD COLUMN "estimatedImpact" TEXT;
ALTER TABLE "DecisionOption" ADD COLUMN "score" INTEGER;

-- OODA Operating Loop
CREATE TYPE "OodaPhase" AS ENUM ('OBSERVE', 'THINK', 'DECIDE', 'ASK_CHAIRMAN', 'EXECUTE', 'MEASURE', 'LEARN', 'COMPLETE', 'FAILED');

CREATE TABLE "OperatingLoopCycle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phase" "OodaPhase" NOT NULL DEFAULT 'OBSERVE',
    "trigger" TEXT NOT NULL,
    "observations" JSONB NOT NULL DEFAULT '{}',
    "analysis" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '[]',
    "recommendation" JSONB,
    "chairmanVerdict" TEXT,
    "execution" JSONB NOT NULL DEFAULT '{}',
    "measurements" JSONB NOT NULL DEFAULT '{}',
    "lessons" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingLoopCycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatingLoopCycle_companyId_phase_idx" ON "OperatingLoopCycle"("companyId", "phase");
CREATE INDEX "OperatingLoopCycle_companyId_createdAt_idx" ON "OperatingLoopCycle"("companyId", "createdAt" DESC);

ALTER TABLE "OperatingLoopCycle" ADD CONSTRAINT "OperatingLoopCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
