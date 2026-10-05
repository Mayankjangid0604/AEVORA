-- CreateEnum
CREATE TYPE "PfProductLifecycle" AS ENUM ('IDEA', 'VALIDATING', 'VALIDATED', 'PLANNING', 'IN_DEVELOPMENT', 'TESTING', 'SECURITY_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'RELEASED', 'LAUNCHED', 'ACTIVE', 'DEPRECATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "PfIdeaStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'VALIDATED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "PfReleaseEnv" AS ENUM ('DEVELOPMENT', 'TEST', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PfLaunchStatus" AS ENUM ('PLANNED', 'READY', 'LAUNCHED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "PfSecuritySeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PfFeedbackSource" AS ENUM ('SURVEY', 'INTERVIEW', 'SUPPORT_TICKET', 'USAGE_SIGNAL', 'AI_SYNTHESIZED');

-- CreateEnum
CREATE TYPE "PfQAStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "PfProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "problemStatement" TEXT,
    "targetCustomer" TEXT,
    "category" TEXT,
    "lifecycle" "PfProductLifecycle" NOT NULL DEFAULT 'IDEA',
    "ownerId" TEXT NOT NULL,
    "registeredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "strategicThemeId" TEXT,
    "strategicInitiativeId" TEXT,
    "researchProjectId" TEXT,
    "labProjectId" TEXT,
    "currentVersion" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "lifecycle" "PfProductLifecycle" NOT NULL DEFAULT 'PLANNING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "isImmutable" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PfProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductIdea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "proposedSolution" TEXT,
    "targetCustomer" TEXT,
    "marketHypothesis" TEXT,
    "evidence" TEXT,
    "strategicRationale" TEXT,
    "expectedValueMc" INTEGER,
    "risks" TEXT,
    "assumptions" TEXT,
    "originatingSource" TEXT,
    "status" "PfIdeaStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfProductIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductRequirement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reqType" TEXT NOT NULL DEFAULT 'FUNCTIONAL',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfProductRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductFeature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'BACKLOG',
    "ownerId" TEXT,
    "engineeringTaskId" TEXT,
    "qaStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "securityCleared" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfProductFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfSecurityReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "overallSeverity" "PfSecuritySeverity" NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedBy" TEXT NOT NULL,
    "clearedBy" TEXT,
    "clearedAt" TIMESTAMP(3),
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfSecurityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfQARecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT,
    "unitTestStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "integrationStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "acceptanceStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "regressionStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "performanceStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "securityStatus" "PfQAStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "overallReady" BOOLEAN NOT NULL DEFAULT false,
    "evidenceNotes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfQARecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductRelease" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT NOT NULL,
    "environment" "PfReleaseEnv" NOT NULL DEFAULT 'DEVELOPMENT',
    "buildReference" TEXT,
    "qaRecordId" TEXT,
    "securityReviewId" TEXT,
    "approvalId" TEXT,
    "releasedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfProductRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductLaunch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "status" "PfLaunchStatus" NOT NULL DEFAULT 'PLANNED',
    "launchPlan" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "launchedBy" TEXT,
    "launchedAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rollbackReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PfProductLaunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfCustomerFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT,
    "source" "PfFeedbackSource" NOT NULL DEFAULT 'SUPPORT_TICKET',
    "content" TEXT NOT NULL,
    "sentiment" TEXT,
    "featureRef" TEXT,
    "customerId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "isAiSynthesized" BOOLEAN NOT NULL DEFAULT false,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PfCustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductAnalytics" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionRef" TEXT,
    "adoptionCount" INTEGER NOT NULL DEFAULT 0,
    "activeUsersCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackScore" INTEGER,
    "featureUsageJson" JSONB NOT NULL DEFAULT '{}',
    "errorRatePercent" INTEGER,
    "revenueRefMc" INTEGER,
    "calculatedBy" TEXT NOT NULL,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PfProductAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PfProductAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "productId" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PfProductAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PfProduct_companyId_lifecycle_idx" ON "PfProduct"("companyId", "lifecycle");

-- CreateIndex
CREATE INDEX "PfProduct_companyId_isArchived_idx" ON "PfProduct"("companyId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "PfProduct_companyId_name_key" ON "PfProduct"("companyId", "name");

-- CreateIndex
CREATE INDEX "PfProductVersion_companyId_productId_idx" ON "PfProductVersion"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PfProductVersion_productId_version_key" ON "PfProductVersion"("productId", "version");

-- CreateIndex
CREATE INDEX "PfProductIdea_companyId_status_idx" ON "PfProductIdea"("companyId", "status");

-- CreateIndex
CREATE INDEX "PfProductRequirement_companyId_productId_idx" ON "PfProductRequirement"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfProductFeature_companyId_productId_idx" ON "PfProductFeature"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfSecurityReview_companyId_productId_idx" ON "PfSecurityReview"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfQARecord_companyId_productId_idx" ON "PfQARecord"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PfProductRelease_idempotencyKey_key" ON "PfProductRelease"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PfProductRelease_companyId_productId_idx" ON "PfProductRelease"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfProductRelease_companyId_environment_idx" ON "PfProductRelease"("companyId", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "PfProductLaunch_idempotencyKey_key" ON "PfProductLaunch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PfProductLaunch_companyId_productId_idx" ON "PfProductLaunch"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfCustomerFeedback_companyId_productId_idx" ON "PfCustomerFeedback"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfProductAnalytics_companyId_productId_idx" ON "PfProductAnalytics"("companyId", "productId");

-- CreateIndex
CREATE INDEX "PfProductAuditEvent_companyId_createdAt_idx" ON "PfProductAuditEvent"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PfProductAuditEvent_companyId_productId_idx" ON "PfProductAuditEvent"("companyId", "productId");


-- AddForeignKey
ALTER TABLE "PfProduct" ADD CONSTRAINT "PfProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductVersion" ADD CONSTRAINT "PfProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductIdea" ADD CONSTRAINT "PfProductIdea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductIdea" ADD CONSTRAINT "PfProductIdea_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductRequirement" ADD CONSTRAINT "PfProductRequirement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductFeature" ADD CONSTRAINT "PfProductFeature_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfSecurityReview" ADD CONSTRAINT "PfSecurityReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfQARecord" ADD CONSTRAINT "PfQARecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductRelease" ADD CONSTRAINT "PfProductRelease_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductLaunch" ADD CONSTRAINT "PfProductLaunch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfCustomerFeedback" ADD CONSTRAINT "PfCustomerFeedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductAnalytics" ADD CONSTRAINT "PfProductAnalytics_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductAuditEvent" ADD CONSTRAINT "PfProductAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PfProductAuditEvent" ADD CONSTRAINT "PfProductAuditEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PfProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

