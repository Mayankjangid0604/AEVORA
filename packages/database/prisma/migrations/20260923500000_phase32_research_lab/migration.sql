-- Phase 32: AEVORA Research Lab
-- Adds general research domain models: LabProject, ResQuestion, ResHypothesis,
-- LabExperiment, LabExperimentRun, LabResult, LabEvaluation, LabFinding,
-- LabEvidenceItem, LabReproduction, LabRecommendation

-- Enums
CREATE TYPE "LabProjectStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ResQuestionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ANSWERED', 'ARCHIVED', 'ABANDONED');
CREATE TYPE "ResHypothesisStatus" AS ENUM ('PROPOSED', 'TESTING', 'SUPPORTED', 'REFUTED', 'INCONCLUSIVE', 'ABANDONED');
CREATE TYPE "ResEvidenceType" AS ENUM ('OBSERVATION', 'SOURCE', 'DATA', 'ANALYSIS', 'HYPOTHESIS', 'RESULT', 'FINDING', 'RECOMMENDATION');
CREATE TYPE "ResRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');
CREATE TYPE "ResFindingStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'VALIDATED', 'REJECTED', 'INCONCLUSIVE', 'ARCHIVED');
CREATE TYPE "ResReproductionOutcome" AS ENUM ('REPRODUCED', 'PARTIALLY_REPRODUCED', 'NOT_REPRODUCED');
CREATE TYPE "ResRecommendationStatus" AS ENUM ('DRAFT', 'PROPOSED', 'ACCEPTED', 'REJECTED', 'IMPLEMENTED');

-- LabProject
CREATE TABLE "LabProject" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"      TEXT NOT NULL REFERENCES "Company"("id"),
  "title"          TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "objective"      TEXT NOT NULL,
  "domain"         TEXT NOT NULL DEFAULT 'GENERAL',
  "ownerId"        TEXT NOT NULL REFERENCES "Employee"("id"),
  "status"         "LabProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "isAdvisory"     BOOLEAN NOT NULL DEFAULT true,
  "resourceBudget" INTEGER NOT NULL DEFAULT 0,
  "approvedById"   TEXT,
  "approvedAt"     TIMESTAMP(3),
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "metadata"       JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabProject_companyId_status_idx" ON "LabProject"("companyId", "status");

-- ResQuestion
CREATE TABLE "ResQuestion" (
  "id"                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"         TEXT NOT NULL REFERENCES "Company"("id"),
  "projectId"         TEXT NOT NULL REFERENCES "LabProject"("id"),
  "question"          TEXT NOT NULL,
  "motivation"        TEXT NOT NULL,
  "domain"            TEXT NOT NULL DEFAULT 'GENERAL',
  "ownerId"           TEXT NOT NULL REFERENCES "Employee"("id"),
  "priority"          INTEGER NOT NULL DEFAULT 50,
  "assumptions"       JSONB NOT NULL DEFAULT '[]',
  "status"            "ResQuestionStatus" NOT NULL DEFAULT 'OPEN',
  "relatedStrategyId" TEXT,
  "isAdvisory"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ResQuestion_companyId_status_idx" ON "ResQuestion"("companyId", "status");
CREATE INDEX "ResQuestion_companyId_projectId_idx" ON "ResQuestion"("companyId", "projectId");

-- ResHypothesis
CREATE TABLE "ResHypothesis" (
  "id"                    TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"             TEXT NOT NULL REFERENCES "Company"("id"),
  "projectId"             TEXT NOT NULL REFERENCES "LabProject"("id"),
  "questionId"            TEXT REFERENCES "ResQuestion"("id"),
  "statement"             TEXT NOT NULL,
  "rationale"             TEXT NOT NULL,
  "variables"             JSONB NOT NULL DEFAULT '{}',
  "expectedRelationship"  TEXT NOT NULL,
  "measurableOutcome"     TEXT NOT NULL,
  "assumptions"           JSONB NOT NULL DEFAULT '[]',
  "confidence"            INTEGER NOT NULL DEFAULT 50,
  "falsificationCriteria" TEXT NOT NULL,
  "status"                "ResHypothesisStatus" NOT NULL DEFAULT 'PROPOSED',
  "createdBy"             TEXT NOT NULL,
  "testedById"            TEXT,
  "isAdvisory"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ResHypothesis_companyId_status_idx" ON "ResHypothesis"("companyId", "status");
CREATE INDEX "ResHypothesis_companyId_projectId_idx" ON "ResHypothesis"("companyId", "projectId");

-- LabExperiment
CREATE TABLE "LabExperiment" (
  "id"                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"           TEXT NOT NULL REFERENCES "Company"("id"),
  "projectId"           TEXT NOT NULL REFERENCES "LabProject"("id"),
  "hypothesisId"        TEXT REFERENCES "ResHypothesis"("id"),
  "title"               TEXT NOT NULL,
  "objective"           TEXT NOT NULL,
  "methodology"         TEXT NOT NULL,
  "inputSpec"           JSONB NOT NULL DEFAULT '{}',
  "datasetId"           TEXT,
  "datasetVersion"      TEXT,
  "variables"           JSONB NOT NULL DEFAULT '{}',
  "controls"            JSONB NOT NULL DEFAULT '{}',
  "metrics"             JSONB NOT NULL DEFAULT '[]',
  "expectedResult"      TEXT NOT NULL,
  "stopCondition"       TEXT,
  "resourceLimit"       INTEGER NOT NULL DEFAULT 1000,
  "timeoutSeconds"      INTEGER NOT NULL DEFAULT 3600,
  "environment"         TEXT NOT NULL DEFAULT 'SANDBOX',
  "reproducibilityInfo" JSONB NOT NULL DEFAULT '{}',
  "modelIdentifier"     TEXT,
  "modelVersion"        TEXT,
  "promptVersion"       TEXT,
  "randomSeed"          TEXT,
  "codeVersion"         TEXT,
  "isAdvisory"          BOOLEAN NOT NULL DEFAULT true,
  "createdBy"           TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabExperiment_companyId_projectId_idx" ON "LabExperiment"("companyId", "projectId");

-- LabExperimentRun
CREATE TABLE "LabExperimentRun" (
  "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"       TEXT NOT NULL REFERENCES "Company"("id"),
  "experimentId"    TEXT NOT NULL REFERENCES "LabExperiment"("id"),
  "status"          "ResRunStatus" NOT NULL DEFAULT 'QUEUED',
  "runnerId"        TEXT NOT NULL REFERENCES "Employee"("id"),
  "inputs"          JSONB NOT NULL DEFAULT '{}',
  "outputs"         JSONB NOT NULL DEFAULT '{}',
  "metrics"         JSONB NOT NULL DEFAULT '{}',
  "errors"          JSONB NOT NULL DEFAULT '[]',
  "logs"            JSONB NOT NULL DEFAULT '[]',
  "artifacts"       JSONB NOT NULL DEFAULT '[]',
  "environment"     TEXT NOT NULL DEFAULT 'SANDBOX',
  "modelIdentifier" TEXT,
  "datasetVersion"  TEXT,
  "randomSeed"      TEXT,
  "resourceUsed"    JSONB NOT NULL DEFAULT '{}',
  "startedAt"       TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabExperimentRun_companyId_experimentId_idx" ON "LabExperimentRun"("companyId", "experimentId");
CREATE INDEX "LabExperimentRun_companyId_status_idx" ON "LabExperimentRun"("companyId", "status");

-- LabResult
CREATE TABLE "LabResult" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"    TEXT NOT NULL REFERENCES "Company"("id"),
  "runId"        TEXT NOT NULL UNIQUE REFERENCES "LabExperimentRun"("id"),
  "summary"      TEXT NOT NULL,
  "metrics"      JSONB NOT NULL DEFAULT '{}',
  "artifacts"    JSONB NOT NULL DEFAULT '[]',
  "evidenceType" "ResEvidenceType" NOT NULL DEFAULT 'RESULT',
  "isAdvisory"   BOOLEAN NOT NULL DEFAULT true,
  "finalizedAt"  TIMESTAMP(3),
  "recordedBy"   TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabResult_companyId_idx" ON "LabResult"("companyId");

-- LabEvaluation
CREATE TABLE "LabEvaluation" (
  "id"                      TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"               TEXT NOT NULL REFERENCES "Company"("id"),
  "runId"                   TEXT REFERENCES "LabExperimentRun"("id"),
  "resultId"                TEXT REFERENCES "LabResult"("id"),
  "evaluatorId"             TEXT NOT NULL REFERENCES "Employee"("id"),
  "validity"                TEXT NOT NULL DEFAULT 'UNKNOWN',
  "reproducibility"         TEXT NOT NULL DEFAULT 'UNKNOWN',
  "evidenceQuality"         TEXT NOT NULL DEFAULT 'UNKNOWN',
  "confidence"              INTEGER NOT NULL DEFAULT 50,
  "limitations"             JSONB NOT NULL DEFAULT '[]',
  "alternativeExplanations" JSONB NOT NULL DEFAULT '[]',
  "consistentWithPrior"     BOOLEAN NOT NULL DEFAULT true,
  "notes"                   TEXT,
  "isAdvisory"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabEvaluation_companyId_idx" ON "LabEvaluation"("companyId");

-- LabFinding
CREATE TABLE "LabFinding" (
  "id"                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"         TEXT NOT NULL REFERENCES "Company"("id"),
  "projectId"         TEXT NOT NULL REFERENCES "LabProject"("id"),
  "hypothesisId"      TEXT REFERENCES "ResHypothesis"("id"),
  "statement"         TEXT NOT NULL,
  "supportingEvidence" JSONB NOT NULL DEFAULT '[]',
  "confidence"        INTEGER NOT NULL DEFAULT 50,
  "limitations"       JSONB NOT NULL DEFAULT '[]',
  "counterEvidence"   JSONB NOT NULL DEFAULT '[]',
  "authorId"          TEXT NOT NULL REFERENCES "Employee"("id"),
  "evaluatorId"       TEXT,
  "status"            "ResFindingStatus" NOT NULL DEFAULT 'DRAFT',
  "isAdvisory"        BOOLEAN NOT NULL DEFAULT true,
  "reviewedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabFinding_companyId_status_idx" ON "LabFinding"("companyId", "status");
CREATE INDEX "LabFinding_companyId_projectId_idx" ON "LabFinding"("companyId", "projectId");

-- LabEvidenceItem
CREATE TABLE "LabEvidenceItem" (
  "id"               TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"        TEXT NOT NULL REFERENCES "Company"("id"),
  "hypothesisId"     TEXT REFERENCES "ResHypothesis"("id"),
  "evidenceType"     "ResEvidenceType" NOT NULL DEFAULT 'OBSERVATION',
  "content"          TEXT NOT NULL,
  "source"           TEXT,
  "sourceType"       TEXT,
  "retrievedAt"      TIMESTAMP(3),
  "contentHash"      TEXT,
  "provenance"       TEXT,
  "credibility"      INTEGER NOT NULL DEFAULT 50,
  "confidence"       INTEGER NOT NULL DEFAULT 50,
  "isContradicting"  BOOLEAN NOT NULL DEFAULT false,
  "recordedBy"       TEXT NOT NULL,
  "processingMethod" TEXT,
  "isAdvisory"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabEvidenceItem_companyId_idx" ON "LabEvidenceItem"("companyId");
CREATE INDEX "LabEvidenceItem_companyId_hypothesisId_idx" ON "LabEvidenceItem"("companyId", "hypothesisId");

-- LabReproduction
CREATE TABLE "LabReproduction" (
  "id"                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"         TEXT NOT NULL REFERENCES "Company"("id"),
  "originalRunId"     TEXT NOT NULL REFERENCES "LabExperimentRun"("id"),
  "reproductionRunId" TEXT NOT NULL REFERENCES "LabExperimentRun"("id"),
  "differences"       JSONB NOT NULL DEFAULT '{}',
  "outcome"           "ResReproductionOutcome" NOT NULL DEFAULT 'NOT_REPRODUCED',
  "notes"             TEXT,
  "conductedBy"       TEXT NOT NULL,
  "isAdvisory"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabReproduction_companyId_idx" ON "LabReproduction"("companyId");

-- LabRecommendation
CREATE TABLE "LabRecommendation" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"    TEXT NOT NULL REFERENCES "Company"("id"),
  "projectId"    TEXT NOT NULL REFERENCES "LabProject"("id"),
  "statement"    TEXT NOT NULL,
  "rationale"    TEXT NOT NULL,
  "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
  "confidence"   INTEGER NOT NULL DEFAULT 50,
  "strategyLink" TEXT,
  "status"       "ResRecommendationStatus" NOT NULL DEFAULT 'DRAFT',
  "authorId"     TEXT NOT NULL REFERENCES "Employee"("id"),
  "isAdvisory"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabRecommendation_companyId_status_idx" ON "LabRecommendation"("companyId", "status");
