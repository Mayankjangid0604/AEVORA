-- Phase 31: Autonomous Strategy Engine

-- Enums
CREATE TYPE "StrategicHorizon" AS ENUM ('SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM');
CREATE TYPE "StrategicThemeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "StrategicInitiativeStatus" AS ENUM ('PROPOSED', 'EVALUATING', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "StrategicReversibility" AS ENUM ('REVERSIBLE', 'PARTIALLY_REVERSIBLE', 'IRREVERSIBLE');
CREATE TYPE "StrategyScenarioType" AS ENUM ('BASE', 'UPSIDE', 'DOWNSIDE', 'STRESS');
CREATE TYPE "StrategyForecastType" AS ENUM ('REVENUE', 'CUSTOMER_GROWTH', 'WORKFORCE_DEMAND', 'CAPACITY', 'COST', 'MARKET_EXPANSION', 'PRODUCT_ADOPTION', 'AI_CAPABILITY');
CREATE TYPE "StrategyReviewStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "StrategicExperimentStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'STOPPED');

-- StrategicTheme
CREATE TABLE "StrategicTheme" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "status"      "StrategicThemeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy"   TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicTheme_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategicTheme_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StrategicTheme_companyId_status_idx" ON "StrategicTheme"("companyId", "status");

-- StrategicInitiative
CREATE TABLE "StrategicInitiative" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"       TEXT NOT NULL,
    "objectiveId"     TEXT,
    "themeId"         TEXT,
    "title"           TEXT NOT NULL,
    "description"     TEXT,
    "rationale"       TEXT,
    "ownerId"         TEXT NOT NULL,
    "horizon"         "StrategicHorizon" NOT NULL DEFAULT 'MEDIUM_TERM',
    "reversibility"   "StrategicReversibility" NOT NULL DEFAULT 'REVERSIBLE',
    "status"          "StrategicInitiativeStatus" NOT NULL DEFAULT 'PROPOSED',
    "expectedBenefit" JSONB NOT NULL DEFAULT '{}',
    "estimatedCost"   INTEGER NOT NULL DEFAULT 0,
    "resources"       JSONB NOT NULL DEFAULT '[]',
    "assumptions"     JSONB NOT NULL DEFAULT '[]',
    "risks"           JSONB NOT NULL DEFAULT '[]',
    "dependencies"    JSONB NOT NULL DEFAULT '[]',
    "isAdvisory"      BOOLEAN NOT NULL DEFAULT true,
    "confidence"      INTEGER NOT NULL DEFAULT 50,
    "approvedById"    TEXT,
    "approvedAt"      TIMESTAMP(3),
    "decisionId"      TEXT,
    "startedAt"       TIMESTAMP(3),
    "completedAt"     TIMESTAMP(3),
    "evidenceNote"    TEXT,
    "outcomeData"     JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicInitiative_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategicInitiative_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicInitiative_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "CompanyObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrategicInitiative_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "StrategicTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrategicInitiative_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicInitiative_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ExecutiveDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StrategicInitiative_companyId_status_idx" ON "StrategicInitiative"("companyId", "status");
CREATE INDEX "StrategicInitiative_companyId_horizon_idx" ON "StrategicInitiative"("companyId", "horizon");

-- StrategicOption
CREATE TABLE "StrategicOption" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"       TEXT NOT NULL,
    "initiativeId"    TEXT,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "horizon"         "StrategicHorizon" NOT NULL DEFAULT 'MEDIUM_TERM',
    "assumptions"     JSONB NOT NULL DEFAULT '[]',
    "risks"           JSONB NOT NULL DEFAULT '[]',
    "expectedBenefit" JSONB NOT NULL DEFAULT '{}',
    "estimatedCost"   INTEGER NOT NULL DEFAULT 0,
    "resources"       JSONB NOT NULL DEFAULT '[]',
    "dependencies"    JSONB NOT NULL DEFAULT '[]',
    "constraints"     JSONB NOT NULL DEFAULT '[]',
    "reversibility"   "StrategicReversibility" NOT NULL DEFAULT 'REVERSIBLE',
    "confidence"      INTEGER NOT NULL DEFAULT 50,
    "evidence"        JSONB NOT NULL DEFAULT '[]',
    "isAdvisory"      BOOLEAN NOT NULL DEFAULT true,
    "isSelected"      BOOLEAN NOT NULL DEFAULT false,
    "generatedBy"     TEXT NOT NULL,
    "evaluatedBy"     TEXT,
    "evaluationNote"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategicOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicOption_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StrategicOption_companyId_idx" ON "StrategicOption"("companyId");
CREATE INDEX "StrategicOption_companyId_initiativeId_idx" ON "StrategicOption"("companyId", "initiativeId");

-- StrategicScenario
CREATE TABLE "StrategicScenario" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"    TEXT NOT NULL,
    "initiativeId" TEXT,
    "title"        TEXT NOT NULL,
    "scenarioType" "StrategyScenarioType" NOT NULL DEFAULT 'BASE',
    "assumptions"  JSONB NOT NULL DEFAULT '[]',
    "forecasts"    JSONB NOT NULL DEFAULT '{}',
    "risks"        JSONB NOT NULL DEFAULT '[]',
    "constraints"  JSONB NOT NULL DEFAULT '[]',
    "confidence"   INTEGER NOT NULL DEFAULT 50,
    "isAdvisory"   BOOLEAN NOT NULL DEFAULT true,
    "generatedBy"  TEXT NOT NULL,
    "reviewedBy"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicScenario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategicScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicScenario_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StrategicScenario_companyId_scenarioType_idx" ON "StrategicScenario"("companyId", "scenarioType");

-- StrategicForecast
CREATE TABLE "StrategicForecast" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"    TEXT NOT NULL,
    "initiativeId" TEXT,
    "forecastType" "StrategyForecastType" NOT NULL,
    "version"      INTEGER NOT NULL DEFAULT 1,
    "horizon"      "StrategicHorizon" NOT NULL DEFAULT 'MEDIUM_TERM',
    "value"        INTEGER NOT NULL DEFAULT 0,
    "valueLow"     INTEGER NOT NULL DEFAULT 0,
    "valueHigh"    INTEGER NOT NULL DEFAULT 0,
    "confidence"   INTEGER NOT NULL DEFAULT 50,
    "assumptions"  JSONB NOT NULL DEFAULT '[]',
    "methodology"  TEXT,
    "sourceData"   JSONB NOT NULL DEFAULT '{}',
    "generatedBy"  TEXT NOT NULL,
    "isAdvisory"   BOOLEAN NOT NULL DEFAULT true,
    "actualValue"  INTEGER,
    "outcomeNote"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicForecast_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategicForecast_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicForecast_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StrategicForecast_companyId_forecastType_idx" ON "StrategicForecast"("companyId", "forecastType");
CREATE INDEX "StrategicForecast_companyId_forecastType_version_idx" ON "StrategicForecast"("companyId", "forecastType", "version");

-- StrategyReviewCycle
CREATE TABLE "StrategyReviewCycle" (
    "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"           TEXT NOT NULL,
    "idempotencyKey"      TEXT NOT NULL,
    "status"              "StrategyReviewStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy"         TEXT NOT NULL,
    "driftDetected"       BOOLEAN NOT NULL DEFAULT false,
    "warningSignals"      JSONB NOT NULL DEFAULT '[]',
    "gapsIdentified"      JSONB NOT NULL DEFAULT '[]',
    "recommendationCount" INTEGER NOT NULL DEFAULT 0,
    "escalationCount"     INTEGER NOT NULL DEFAULT 0,
    "summary"             JSONB,
    "error"               TEXT,
    "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"         TIMESTAMP(3),
    CONSTRAINT "StrategyReviewCycle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategyReviewCycle_companyId_idempotencyKey_key" UNIQUE ("companyId", "idempotencyKey"),
    CONSTRAINT "StrategyReviewCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StrategyReviewCycle_companyId_status_idx" ON "StrategyReviewCycle"("companyId", "status");

-- StrategicExperiment
CREATE TABLE "StrategicExperiment" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"       TEXT NOT NULL,
    "initiativeId"    TEXT,
    "title"           TEXT NOT NULL,
    "hypothesis"      TEXT NOT NULL,
    "objective"       TEXT NOT NULL,
    "metric"          TEXT NOT NULL,
    "expectedOutcome" TEXT NOT NULL,
    "resourceLimit"   INTEGER NOT NULL DEFAULT 0,
    "duration"        INTEGER NOT NULL DEFAULT 30,
    "stopCondition"   TEXT,
    "ownerId"         TEXT NOT NULL,
    "status"          "StrategicExperimentStatus" NOT NULL DEFAULT 'PROPOSED',
    "actualOutcome"   TEXT,
    "lessonNote"      TEXT,
    "startedAt"       TIMESTAMP(3),
    "completedAt"     TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicExperiment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StrategicExperiment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicExperiment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrategicExperiment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StrategicExperiment_companyId_status_idx" ON "StrategicExperiment"("companyId", "status");
