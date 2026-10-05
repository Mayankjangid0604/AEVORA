-- Phase 26: Autonomous Sales & Business Development
-- Migration: 20260922120000_phase26_autonomous_sales

-- CreateEnum
CREATE TYPE "SalesLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "SalesStage" AS ENUM ('NEW', 'QUALIFICATION', 'DISCOVERY', 'SOLUTION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "TargetAccountStatus" AS ENUM ('IDENTIFIED', 'RESEARCHING', 'ACTIVE', 'WON', 'LOST', 'PAUSED');

-- CreateEnum
CREATE TYPE "SalesActivityType" AS ENUM ('RESEARCH', 'CALL', 'MEETING', 'EMAIL', 'FOLLOW_UP', 'DISCOVERY', 'PROPOSAL_PREP', 'INTERNAL_REVIEW', 'CUSTOMER_RESPONSE', 'NOTE');

-- CreateEnum
CREATE TYPE "QualificationRecommendation" AS ENUM ('QUALIFIED', 'DISQUALIFIED', 'NEEDS_MORE_INFO');

-- CreateEnum
CREATE TYPE "SalesActorType" AS ENUM ('HUMAN', 'AI_AGENT');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "expectedCloseDate" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "probability" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "salesLeadId" TEXT,
ADD COLUMN     "salesStage" "SalesStage" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "SalesLead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationName" TEXT,
    "contactName" TEXT,
    "contactRole" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "source" TEXT,
    "industry" TEXT,
    "geography" TEXT,
    "companySize" TEXT,
    "status" "SalesLeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "targetAccountId" TEXT,
    "convertedClientId" TEXT,
    "convertedOpportunityId" TEXT,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "industry" TEXT,
    "geography" TEXT,
    "sizeCategory" TEXT,
    "website" TEXT,
    "description" TEXT,
    "status" "TargetAccountStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "accountOwnerId" TEXT,
    "estimatedValue" INTEGER,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" "SalesActorType" NOT NULL DEFAULT 'HUMAN',
    "opportunityId" TEXT,
    "salesLeadId" TEXT,
    "targetAccountId" TEXT,
    "activityType" "SalesActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "outcome" TEXT,
    "nextAction" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluatorType" "SalesActorType" NOT NULL DEFAULT 'HUMAN',
    "opportunityId" TEXT,
    "salesLeadId" TEXT,
    "customerFitScore" INTEGER,
    "problemClarityScore" INTEGER,
    "budgetSignalScore" INTEGER,
    "urgencyScore" INTEGER,
    "authorityScore" INTEGER,
    "technicalFeasibilityScore" INTEGER,
    "strategicRelevanceScore" INTEGER,
    "deliveryFeasibilityScore" INTEGER,
    "riskScore" INTEGER,
    "overallScore" INTEGER NOT NULL,
    "recommendation" "QualificationRecommendation" NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "scoringVersion" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityScore" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "scoreValue" INTEGER NOT NULL,
    "scoringVersion" TEXT NOT NULL DEFAULT '1.0',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "components" JSONB NOT NULL DEFAULT '{}',
    "modelEstimates" JSONB NOT NULL DEFAULT '{}',
    "humanInputs" JSONB NOT NULL DEFAULT '{}',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "reasoning" TEXT NOT NULL,
    "explanations" JSONB NOT NULL DEFAULT '[]',
    "scoredById" TEXT NOT NULL,
    "scoredByType" "SalesActorType" NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" "SalesActorType" NOT NULL DEFAULT 'HUMAN',
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "correlationId" TEXT,
    "opportunityId" TEXT,
    "salesLeadId" TEXT,
    "targetAccountId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesAgentConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "constraints" JSONB NOT NULL DEFAULT '{}',
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesActivity_idempotencyKey_key" ON "SalesActivity"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SalesAgentConfig_employeeId_key" ON "SalesAgentConfig"("employeeId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_salesLeadId_fkey" FOREIGN KEY ("salesLeadId") REFERENCES "SalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "TargetAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAccount" ADD CONSTRAINT "TargetAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAccount" ADD CONSTRAINT "TargetAccount_accountOwnerId_fkey" FOREIGN KEY ("accountOwnerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_salesLeadId_fkey" FOREIGN KEY ("salesLeadId") REFERENCES "SalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "TargetAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRecord" ADD CONSTRAINT "QualificationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRecord" ADD CONSTRAINT "QualificationRecord_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRecord" ADD CONSTRAINT "QualificationRecord_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRecord" ADD CONSTRAINT "QualificationRecord_salesLeadId_fkey" FOREIGN KEY ("salesLeadId") REFERENCES "SalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityScore" ADD CONSTRAINT "OpportunityScore_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAuditEvent" ADD CONSTRAINT "SalesAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAuditEvent" ADD CONSTRAINT "SalesAuditEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAuditEvent" ADD CONSTRAINT "SalesAuditEvent_salesLeadId_fkey" FOREIGN KEY ("salesLeadId") REFERENCES "SalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAuditEvent" ADD CONSTRAINT "SalesAuditEvent_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "TargetAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAgentConfig" ADD CONSTRAINT "SalesAgentConfig_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
