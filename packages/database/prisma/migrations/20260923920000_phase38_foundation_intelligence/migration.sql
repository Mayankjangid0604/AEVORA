-- CreateEnum
CREATE TYPE "FiDatasetStatus" AS ENUM ('DRAFT', 'VALIDATING', 'VALIDATED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FiTrainingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FiModelStatus" AS ENUM ('EXPERIMENTAL', 'EVALUATED', 'APPROVED', 'PRODUCTION', 'RETIRED');

-- CreateEnum
CREATE TYPE "FiEvalResult" AS ENUM ('PASS', 'FAIL', 'INCONCLUSIVE');

-- CreateTable
CREATE TABLE "FiDataset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" "FiDatasetStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceRef" TEXT,
    "recordCount" INTEGER,
    "sizeBytes" INTEGER,
    "provenance" TEXT,
    "hasSecrets" BOOLEAN NOT NULL DEFAULT false,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "validatedBy" TEXT,
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiTrainingJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jobType" TEXT NOT NULL DEFAULT 'FINE_TUNE',
    "baseModelRef" TEXT,
    "hyperparams" JSONB,
    "resourceLimitCpu" INTEGER,
    "resourceLimitMemMb" INTEGER,
    "status" "FiTrainingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiTrainingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiCheckpoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "epochPct" INTEGER,
    "loss" TEXT,
    "metrics" JSONB,
    "artifactRef" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiModelVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "family" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "FiModelStatus" NOT NULL DEFAULT 'EXPERIMENTAL',
    "description" TEXT,
    "artifactRef" TEXT,
    "parentVersionId" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "proposedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredBy" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiEvaluation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "benchmarkName" TEXT NOT NULL,
    "result" "FiEvalResult" NOT NULL DEFAULT 'INCONCLUSIVE',
    "score" TEXT,
    "notes" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "evaluatedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "datasetId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiDataset_companyId_status_idx" ON "FiDataset"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiDataset_companyId_name_version_key" ON "FiDataset"("companyId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FiTrainingJob_idempotencyKey_key" ON "FiTrainingJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FiTrainingJob_companyId_status_idx" ON "FiTrainingJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "FiCheckpoint_companyId_jobId_idx" ON "FiCheckpoint"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "FiModelVersion_companyId_status_idx" ON "FiModelVersion"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiModelVersion_companyId_family_version_key" ON "FiModelVersion"("companyId", "family", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FiEvaluation_idempotencyKey_key" ON "FiEvaluation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FiEvaluation_companyId_modelVersionId_idx" ON "FiEvaluation"("companyId", "modelVersionId");

-- CreateIndex
CREATE INDEX "FiAuditEvent_companyId_datasetId_idx" ON "FiAuditEvent"("companyId", "datasetId");

-- CreateIndex
CREATE INDEX "FiAuditEvent_companyId_createdAt_idx" ON "FiAuditEvent"("companyId", "createdAt");


-- AddForeignKey
ALTER TABLE "FiDataset" ADD CONSTRAINT "FiDataset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiTrainingJob" ADD CONSTRAINT "FiTrainingJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "FiDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiCheckpoint" ADD CONSTRAINT "FiCheckpoint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FiTrainingJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiModelVersion" ADD CONSTRAINT "FiModelVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FiTrainingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiModelVersion" ADD CONSTRAINT "FiModelVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "FiModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiEvaluation" ADD CONSTRAINT "FiEvaluation_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "FiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiAuditEvent" ADD CONSTRAINT "FiAuditEvent_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "FiDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

