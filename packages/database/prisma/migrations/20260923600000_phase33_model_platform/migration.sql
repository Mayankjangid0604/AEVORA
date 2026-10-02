-- CreateEnum
CREATE TYPE "MpProviderType" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE', 'MISTRAL', 'COHERE', 'LOCAL', 'SELF_HOSTED', 'AEVORA_INTERNAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MpProviderStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'UNAVAILABLE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MpModelStatus" AS ENUM ('DISCOVERED', 'REGISTERED', 'ACTIVE', 'DEGRADED', 'DISABLED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MpCapabilityType" AS ENUM ('TEXT_GENERATION', 'STRUCTURED_OUTPUT', 'EMBEDDINGS', 'TOOL_USE', 'LONG_CONTEXT', 'CODE', 'REASONING', 'VISION', 'AUDIO', 'MULTIMODAL', 'CLASSIFICATION', 'SUMMARIZATION', 'EXTRACTION');

-- CreateEnum
CREATE TYPE "MpDeploymentState" AS ENUM ('REGISTERED', 'EVALUATING', 'APPROVED', 'DEPLOYED', 'ACTIVE', 'DEPRECATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MpInferenceOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'TIMEOUT', 'FALLBACK_USED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MpKillSwitchScope" AS ENUM ('PROVIDER', 'MODEL', 'CAPABILITY', 'ALL_INFERENCE');

-- CreateEnum
CREATE TYPE "MpEmbeddingStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'DISABLED');

-- DropForeignKey
ALTER TABLE "LabEvaluation" DROP CONSTRAINT "LabEvaluation_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabEvaluation" DROP CONSTRAINT "LabEvaluation_evaluatorId_fkey";

-- DropForeignKey
ALTER TABLE "LabEvaluation" DROP CONSTRAINT "LabEvaluation_resultId_fkey";

-- DropForeignKey
ALTER TABLE "LabEvaluation" DROP CONSTRAINT "LabEvaluation_runId_fkey";

-- DropForeignKey
ALTER TABLE "LabEvidenceItem" DROP CONSTRAINT "LabEvidenceItem_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabEvidenceItem" DROP CONSTRAINT "LabEvidenceItem_hypothesisId_fkey";

-- DropForeignKey
ALTER TABLE "LabExperiment" DROP CONSTRAINT "LabExperiment_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabExperiment" DROP CONSTRAINT "LabExperiment_hypothesisId_fkey";

-- DropForeignKey
ALTER TABLE "LabExperiment" DROP CONSTRAINT "LabExperiment_projectId_fkey";

-- DropForeignKey
ALTER TABLE "LabExperimentRun" DROP CONSTRAINT "LabExperimentRun_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabExperimentRun" DROP CONSTRAINT "LabExperimentRun_experimentId_fkey";

-- DropForeignKey
ALTER TABLE "LabExperimentRun" DROP CONSTRAINT "LabExperimentRun_runnerId_fkey";

-- DropForeignKey
ALTER TABLE "LabFinding" DROP CONSTRAINT "LabFinding_authorId_fkey";

-- DropForeignKey
ALTER TABLE "LabFinding" DROP CONSTRAINT "LabFinding_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabFinding" DROP CONSTRAINT "LabFinding_hypothesisId_fkey";

-- DropForeignKey
ALTER TABLE "LabFinding" DROP CONSTRAINT "LabFinding_projectId_fkey";

-- DropForeignKey
ALTER TABLE "LabProject" DROP CONSTRAINT "LabProject_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabProject" DROP CONSTRAINT "LabProject_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "LabRecommendation" DROP CONSTRAINT "LabRecommendation_authorId_fkey";

-- DropForeignKey
ALTER TABLE "LabRecommendation" DROP CONSTRAINT "LabRecommendation_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabRecommendation" DROP CONSTRAINT "LabRecommendation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "LabReproduction" DROP CONSTRAINT "LabReproduction_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabReproduction" DROP CONSTRAINT "LabReproduction_originalRunId_fkey";

-- DropForeignKey
ALTER TABLE "LabReproduction" DROP CONSTRAINT "LabReproduction_reproductionRunId_fkey";

-- DropForeignKey
ALTER TABLE "LabResult" DROP CONSTRAINT "LabResult_companyId_fkey";

-- DropForeignKey
ALTER TABLE "LabResult" DROP CONSTRAINT "LabResult_runId_fkey";

-- DropForeignKey
ALTER TABLE "ResHypothesis" DROP CONSTRAINT "ResHypothesis_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ResHypothesis" DROP CONSTRAINT "ResHypothesis_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ResHypothesis" DROP CONSTRAINT "ResHypothesis_questionId_fkey";

-- DropForeignKey
ALTER TABLE "ResQuestion" DROP CONSTRAINT "ResQuestion_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ResQuestion" DROP CONSTRAINT "ResQuestion_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "ResQuestion" DROP CONSTRAINT "ResQuestion_projectId_fkey";

-- DropIndex
DROP INDEX "CompanyObjective_companyId_idx";

-- AlterTable
ALTER TABLE "AIProvisioningRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BonusProposal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CompanyKPI" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CompanyObjective" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CompanyOpportunity" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CompanyRisk" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EscalationRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExecutiveDecision" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "HiringRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabEvaluation" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabEvidenceItem" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabExperiment" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabExperimentRun" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabFinding" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabProject" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabRecommendation" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabReproduction" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabResult" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PerformanceReview" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ResHypothesis" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ResQuestion" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ResourceAllocationRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategicExperiment" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategicForecast" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategicInitiative" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategicOption" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategicScenario" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategicTheme" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StrategyReviewCycle" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkerProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkforcePlan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "MpProvider" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerType" "MpProviderType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT,
    "status" "MpProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpProviderHealth" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "p50LatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "errorRateBps" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpProviderHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpModel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelFamily" TEXT,
    "modelType" TEXT NOT NULL DEFAULT 'TEXT_GENERATION',
    "contextWindow" INTEGER NOT NULL DEFAULT 4096,
    "modality" TEXT NOT NULL DEFAULT 'TEXT',
    "status" "MpModelStatus" NOT NULL DEFAULT 'REGISTERED',
    "deploymentType" TEXT NOT NULL DEFAULT 'API',
    "costPerInputTokenMc" INTEGER NOT NULL DEFAULT 0,
    "costPerOutputTokenMc" INTEGER NOT NULL DEFAULT 0,
    "p50LatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 100,
    "safetyMetadata" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "registeredBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpModelCapability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "capabilityType" "MpCapabilityType" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "notes" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpModelCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpModelVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "providerVersion" TEXT,
    "deploymentState" "MpDeploymentState" NOT NULL DEFAULT 'REGISTERED',
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "releaseNotes" TEXT,
    "predecessorId" TEXT,
    "evaluationState" TEXT NOT NULL DEFAULT 'PENDING',
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "releasedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpModelHealth" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "p50LatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "errorRateBps" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpModelHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpRoutePolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredCapability" TEXT NOT NULL,
    "maxLatencyMs" INTEGER,
    "maxCostPerCallMc" INTEGER,
    "minReliabilityScore" INTEGER NOT NULL DEFAULT 0,
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "preferredModelId" TEXT,
    "fallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxFallbackDepth" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpRoutePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpFallbackChain" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceModelId" TEXT NOT NULL,
    "targetModelId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpFallbackChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpInferenceExecution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT,
    "capabilityType" TEXT NOT NULL,
    "workloadType" TEXT NOT NULL DEFAULT 'GENERAL',
    "idempotencyKey" TEXT,
    "outcome" "MpInferenceOutcome" NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackFromModelId" TEXT,
    "errorClass" TEXT,
    "queueLatencyMs" INTEGER,
    "providerLatencyMs" INTEGER,
    "totalLatencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostMc" INTEGER,
    "actualCostMc" INTEGER,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpInferenceExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpKillSwitch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "MpKillSwitchScope" NOT NULL,
    "providerId" TEXT,
    "modelId" TEXT,
    "reason" TEXT NOT NULL,
    "activatedBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedBy" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpKillSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpPromptTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpPromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpPromptTemplateVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "systemPrompt" TEXT,
    "userTemplate" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "modelHints" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpPromptTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpEmbeddingModel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "maxInputTokens" INTEGER NOT NULL DEFAULT 8192,
    "status" "MpEmbeddingStatus" NOT NULL DEFAULT 'ACTIVE',
    "costPerTokenMc" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpEmbeddingModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpProvider_companyId_providerType_displayName_key" ON "MpProvider"("companyId", "providerType", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "MpModel_companyId_providerId_modelIdentifier_key" ON "MpModel"("companyId", "providerId", "modelIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "MpModelCapability_modelId_capabilityType_key" ON "MpModelCapability"("modelId", "capabilityType");

-- CreateIndex
CREATE UNIQUE INDEX "MpModelVersion_modelId_version_key" ON "MpModelVersion"("modelId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MpRoutePolicy_companyId_name_key" ON "MpRoutePolicy"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MpFallbackChain_companyId_sourceModelId_targetModelId_key" ON "MpFallbackChain"("companyId", "sourceModelId", "targetModelId");

-- CreateIndex
CREATE UNIQUE INDEX "MpInferenceExecution_idempotencyKey_key" ON "MpInferenceExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MpInferenceExecution_companyId_modelId_idx" ON "MpInferenceExecution"("companyId", "modelId");

-- CreateIndex
CREATE INDEX "MpInferenceExecution_companyId_createdAt_idx" ON "MpInferenceExecution"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MpPromptTemplate_companyId_name_key" ON "MpPromptTemplate"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MpPromptTemplateVersion_templateId_version_key" ON "MpPromptTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MpEmbeddingModel_companyId_modelIdentifier_key" ON "MpEmbeddingModel"("companyId", "modelIdentifier");


-- AddForeignKey
ALTER TABLE "LabProject" ADD CONSTRAINT "LabProject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabProject" ADD CONSTRAINT "LabProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResQuestion" ADD CONSTRAINT "ResQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResQuestion" ADD CONSTRAINT "ResQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LabProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResQuestion" ADD CONSTRAINT "ResQuestion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResHypothesis" ADD CONSTRAINT "ResHypothesis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResHypothesis" ADD CONSTRAINT "ResHypothesis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LabProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResHypothesis" ADD CONSTRAINT "ResHypothesis_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ResQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabExperiment" ADD CONSTRAINT "LabExperiment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabExperiment" ADD CONSTRAINT "LabExperiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LabProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabExperiment" ADD CONSTRAINT "LabExperiment_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "ResHypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabExperimentRun" ADD CONSTRAINT "LabExperimentRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabExperimentRun" ADD CONSTRAINT "LabExperimentRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "LabExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabExperimentRun" ADD CONSTRAINT "LabExperimentRun_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LabExperimentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabEvaluation" ADD CONSTRAINT "LabEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabEvaluation" ADD CONSTRAINT "LabEvaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LabExperimentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabEvaluation" ADD CONSTRAINT "LabEvaluation_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "LabResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabEvaluation" ADD CONSTRAINT "LabEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabFinding" ADD CONSTRAINT "LabFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabFinding" ADD CONSTRAINT "LabFinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LabProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabFinding" ADD CONSTRAINT "LabFinding_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "ResHypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabFinding" ADD CONSTRAINT "LabFinding_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabEvidenceItem" ADD CONSTRAINT "LabEvidenceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabEvidenceItem" ADD CONSTRAINT "LabEvidenceItem_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "ResHypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReproduction" ADD CONSTRAINT "LabReproduction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReproduction" ADD CONSTRAINT "LabReproduction_originalRunId_fkey" FOREIGN KEY ("originalRunId") REFERENCES "LabExperimentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReproduction" ADD CONSTRAINT "LabReproduction_reproductionRunId_fkey" FOREIGN KEY ("reproductionRunId") REFERENCES "LabExperimentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRecommendation" ADD CONSTRAINT "LabRecommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRecommendation" ADD CONSTRAINT "LabRecommendation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LabProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRecommendation" ADD CONSTRAINT "LabRecommendation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpProvider" ADD CONSTRAINT "MpProvider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpProviderHealth" ADD CONSTRAINT "MpProviderHealth_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpProviderHealth" ADD CONSTRAINT "MpProviderHealth_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModel" ADD CONSTRAINT "MpModel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModel" ADD CONSTRAINT "MpModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelCapability" ADD CONSTRAINT "MpModelCapability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelCapability" ADD CONSTRAINT "MpModelCapability_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MpModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelVersion" ADD CONSTRAINT "MpModelVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelVersion" ADD CONSTRAINT "MpModelVersion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MpModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelVersion" ADD CONSTRAINT "MpModelVersion_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "MpModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelHealth" ADD CONSTRAINT "MpModelHealth_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpModelHealth" ADD CONSTRAINT "MpModelHealth_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MpModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpRoutePolicy" ADD CONSTRAINT "MpRoutePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpFallbackChain" ADD CONSTRAINT "MpFallbackChain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpFallbackChain" ADD CONSTRAINT "MpFallbackChain_sourceModelId_fkey" FOREIGN KEY ("sourceModelId") REFERENCES "MpModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpFallbackChain" ADD CONSTRAINT "MpFallbackChain_targetModelId_fkey" FOREIGN KEY ("targetModelId") REFERENCES "MpModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpInferenceExecution" ADD CONSTRAINT "MpInferenceExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpInferenceExecution" ADD CONSTRAINT "MpInferenceExecution_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MpModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpKillSwitch" ADD CONSTRAINT "MpKillSwitch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpKillSwitch" ADD CONSTRAINT "MpKillSwitch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MpProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpKillSwitch" ADD CONSTRAINT "MpKillSwitch_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MpModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpPromptTemplate" ADD CONSTRAINT "MpPromptTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpPromptTemplateVersion" ADD CONSTRAINT "MpPromptTemplateVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpPromptTemplateVersion" ADD CONSTRAINT "MpPromptTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MpPromptTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpEmbeddingModel" ADD CONSTRAINT "MpEmbeddingModel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
