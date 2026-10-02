-- CreateEnum
CREATE TYPE "InboundMessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "InboundMessageStatus" AS ENUM ('NEW', 'PROCESSED', 'IGNORED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'BLOCKED', 'OVERDUE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerAcceptanceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "BillingMilestoneStatus" AS ENUM ('PENDING', 'BILLABLE', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerHealthDimension" AS ENUM ('DELIVERY', 'FINANCIAL', 'ENGAGEMENT', 'OVERALL');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingActorType" AS ENUM ('HUMAN', 'AI_AGENT');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PLANNED', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('BLOG_ARTICLE', 'SOCIAL_POST', 'EMAIL_COPY', 'LANDING_PAGE', 'CAMPAIGN_COPY', 'ADVERTISEMENT', 'ANNOUNCEMENT', 'EDUCATIONAL', 'THOUGHT_LEADERSHIP');

-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('WEBSITE', 'BLOG', 'EMAIL', 'SOCIAL_LINKEDIN', 'SOCIAL_TWITTER', 'SOCIAL_INSTAGRAM', 'PAID_SEARCH', 'PAID_SOCIAL', 'CONTENT_SYNDICATION', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClientStatus" ADD VALUE 'ONBOARDING';
ALTER TYPE "ClientStatus" ADD VALUE 'AT_RISK';
ALTER TYPE "ClientStatus" ADD VALUE 'CHURNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectStatus" ADD VALUE 'ONBOARDING';
ALTER TYPE "ProjectStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "ProjectStatus" ADD VALUE 'IN_QA';
ALTER TYPE "ProjectStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "ProjectStatus" ADD VALUE 'ACCEPTED';

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT,
    "campaignId" TEXT,
    "channel" "InboundMessageChannel" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "InboundMessageStatus" NOT NULL DEFAULT 'NEW',
    "extractedIntent" TEXT,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOnboarding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractId" TEXT,
    "projectId" TEXT,
    "ownerId" TEXT,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "requirements" TEXT,
    "scope" TEXT,
    "deliverables" TEXT,
    "timeline" TEXT,
    "billingInfo" JSONB NOT NULL DEFAULT '{}',
    "communicationPref" TEXT,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAcceptance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "requestedById" TEXT NOT NULL,
    "customerActorId" TEXT,
    "scope" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "status" "CustomerAcceptanceStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "changesRequested" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,

    CONSTRAINT "CustomerAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingMilestone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billingCondition" TEXT NOT NULL,
    "status" "BillingMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "billedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerHealthRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dimension" "CustomerHealthDimension" NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "facts" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedBy" TEXT NOT NULL,

    CONSTRAINT "CustomerHealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCommunication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "draftedById" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalId" TEXT,
    "providerRef" TEXT,
    "providerResult" JSONB,
    "idempotencyKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'HUMAN',
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "clientId" TEXT,
    "projectId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "positioning" TEXT,
    "mission" TEXT,
    "valueProposition" TEXT,
    "targetAudience" TEXT,
    "tone" TEXT,
    "voice" TEXT,
    "approvedMessaging" JSONB NOT NULL DEFAULT '[]',
    "prohibitedMessaging" JSONB NOT NULL DEFAULT '[]',
    "visualIdentityRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandGuideline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channelScope" "MarketingChannel",
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandGuideline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPersona" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "description" TEXT,
    "painPoints" JSONB NOT NULL DEFAULT '[]',
    "needs" JSONB NOT NULL DEFAULT '[]',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "interests" JSONB NOT NULL DEFAULT '[]',
    "buyingContext" TEXT,
    "demographicNotes" TEXT,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelId" TEXT,
    "researchSourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketResearch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "researchType" TEXT NOT NULL,
    "findings" JSONB NOT NULL DEFAULT '{}',
    "observedFacts" JSONB NOT NULL DEFAULT '[]',
    "inferences" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelId" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "researchedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingStrategy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "targetAudiences" JSONB NOT NULL DEFAULT '[]',
    "positioning" TEXT,
    "messaging" TEXT,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "campaignPriorities" JSONB NOT NULL DEFAULT '[]',
    "contentThemes" JSONB NOT NULL DEFAULT '[]',
    "kpis" JSONB NOT NULL DEFAULT '[]',
    "budgetRecommendation" INTEGER,
    "timing" TEXT,
    "risks" JSONB NOT NULL DEFAULT '[]',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalId" TEXT,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandProfileId" TEXT,
    "strategyId" TEXT,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "targetAudience" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "budgetRecommendation" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "kpis" JSONB NOT NULL DEFAULT '[]',
    "ownerId" TEXT NOT NULL,
    "approvalId" TEXT,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingContent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campaignId" TEXT,
    "brandProfileId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "channel" "MarketingChannel",
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "approvalId" TEXT,
    "approvedVersion" INTEGER,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publicationIdempotencyKey" TEXT,
    "reviewedById" TEXT,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelId" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "brandGuidelineVersion" INTEGER,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCalendarEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "campaignId" TEXT,
    "channel" "MarketingChannel",
    "targetAudience" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "ownerId" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAnalytics" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contentId" TEXT,
    "campaignId" TEXT,
    "channel" "MarketingChannel",
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "conversions" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "forecastImpressions" INTEGER,
    "forecastConversions" INTEGER,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "dataSource" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" "MarketingActorType" NOT NULL DEFAULT 'HUMAN',
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "contentId" TEXT,
    "campaignId" TEXT,
    "correlationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAgentConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "grantedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundMessage_companyId_status_idx" ON "InboundMessage"("companyId", "status");

-- CreateIndex
CREATE INDEX "InboundMessage_fromAddress_idx" ON "InboundMessage"("fromAddress");

-- CreateIndex
CREATE INDEX "CustomerOnboarding_companyId_clientId_idx" ON "CustomerOnboarding"("companyId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAcceptance_idempotencyKey_key" ON "CustomerAcceptance"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerAcceptance_companyId_projectId_idx" ON "CustomerAcceptance"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "BillingMilestone_companyId_contractId_idx" ON "BillingMilestone"("companyId", "contractId");

-- CreateIndex
CREATE INDEX "CustomerHealthRecord_companyId_clientId_idx" ON "CustomerHealthRecord"("companyId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCommunication_idempotencyKey_key" ON "CustomerCommunication"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerCommunication_companyId_clientId_idx" ON "CustomerCommunication"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "CustomerAuditEvent_companyId_objectType_objectId_idx" ON "CustomerAuditEvent"("companyId", "objectType", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProfile_companyId_key" ON "BrandProfile"("companyId");

-- CreateIndex
CREATE INDEX "BrandGuideline_companyId_brandProfileId_idx" ON "BrandGuideline"("companyId", "brandProfileId");

-- CreateIndex
CREATE INDEX "MarketPersona_companyId_idx" ON "MarketPersona"("companyId");

-- CreateIndex
CREATE INDEX "MarketResearch_companyId_idx" ON "MarketResearch"("companyId");

-- CreateIndex
CREATE INDEX "MarketingStrategy_companyId_idx" ON "MarketingStrategy"("companyId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_companyId_status_idx" ON "MarketingCampaign"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContent_publicationIdempotencyKey_key" ON "MarketingContent"("publicationIdempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingContent_companyId_status_idx" ON "MarketingContent"("companyId", "status");

-- CreateIndex
CREATE INDEX "MarketingContent_companyId_campaignId_idx" ON "MarketingContent"("companyId", "campaignId");

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_companyId_scheduledAt_idx" ON "ContentCalendarEntry"("companyId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MarketingAnalytics_companyId_campaignId_idx" ON "MarketingAnalytics"("companyId", "campaignId");

-- CreateIndex
CREATE INDEX "MarketingAuditEvent_companyId_objectType_objectId_idx" ON "MarketingAuditEvent"("companyId", "objectType", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingAgentConfig_employeeId_key" ON "MarketingAgentConfig"("employeeId");

-- CreateIndex
CREATE INDEX "MarketingAgentConfig_companyId_idx" ON "MarketingAgentConfig"("companyId");

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOnboarding" ADD CONSTRAINT "CustomerOnboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOnboarding" ADD CONSTRAINT "CustomerOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOnboarding" ADD CONSTRAINT "CustomerOnboarding_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOnboarding" ADD CONSTRAINT "CustomerOnboarding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOnboarding" ADD CONSTRAINT "CustomerOnboarding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ProjectDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerHealthRecord" ADD CONSTRAINT "CustomerHealthRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerHealthRecord" ADD CONSTRAINT "CustomerHealthRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunication" ADD CONSTRAINT "CustomerCommunication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunication" ADD CONSTRAINT "CustomerCommunication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunication" ADD CONSTRAINT "CustomerCommunication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunication" ADD CONSTRAINT "CustomerCommunication_draftedById_fkey" FOREIGN KEY ("draftedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunication" ADD CONSTRAINT "CustomerCommunication_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAuditEvent" ADD CONSTRAINT "CustomerAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandGuideline" ADD CONSTRAINT "BrandGuideline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandGuideline" ADD CONSTRAINT "BrandGuideline_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPersona" ADD CONSTRAINT "MarketPersona_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketResearch" ADD CONSTRAINT "MarketResearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingStrategy" ADD CONSTRAINT "MarketingStrategy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "MarketingStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAnalytics" ADD CONSTRAINT "MarketingAnalytics_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAuditEvent" ADD CONSTRAINT "MarketingAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAgentConfig" ADD CONSTRAINT "MarketingAgentConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

