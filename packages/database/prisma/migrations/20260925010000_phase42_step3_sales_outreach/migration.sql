-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "OutreachCampaignStatus" AS ENUM ('SCHEDULED', 'SENT', 'RESPONDED', 'FAILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutreachOutcome" AS ENUM ('NO_RESPONSE', 'INTERESTED', 'NOT_INTERESTED', 'BOOKED');

-- CreateEnum
CREATE TYPE "DiscoveryCallStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "channel" "OutreachChannel" NOT NULL,
    "assignedAgentId" TEXT,
    "scriptId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "responseReceivedAt" TIMESTAMP(3),
    "outcome" "OutreachOutcome",
    "notes" TEXT,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachScript" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "templateName" TEXT NOT NULL,
    "subjectTemplate" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryCall" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conductedAt" TIMESTAMP(3),
    "transcript" TEXT,
    "extractedNeeds" JSONB,
    "estimatedBudget" INTEGER,
    "status" "DiscoveryCallStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachCampaign_idempotencyKey_key" ON "OutreachCampaign"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutreachCampaign_companyId_status_sentAt_idx" ON "OutreachCampaign"("companyId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "OutreachCampaign_leadId_idx" ON "OutreachCampaign"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachScript_companyId_templateName_key" ON "OutreachScript"("companyId", "templateName");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryCall_campaignId_key" ON "DiscoveryCall"("campaignId");

-- CreateIndex
CREATE INDEX "DiscoveryCall_companyId_status_idx" ON "DiscoveryCall"("companyId", "status");

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachScript" ADD CONSTRAINT "OutreachScript_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryCall" ADD CONSTRAINT "DiscoveryCall_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryCall" ADD CONSTRAINT "DiscoveryCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

