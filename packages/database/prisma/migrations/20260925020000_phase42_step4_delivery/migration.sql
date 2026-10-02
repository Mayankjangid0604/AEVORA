-- CreateEnum
CREATE TYPE "ClientProjectType" AS ENUM ('WEBSITE', 'SAAS', 'AUTOMATION', 'APP');

-- CreateEnum
CREATE TYPE "ClientProjectStatus" AS ENUM ('SCOPING', 'BUILDING', 'SAMPLE_SENT', 'REVISION', 'APPROVED', 'INVOICED', 'PAID', 'CLOSED', 'FAILED');

-- CreateTable
CREATE TABLE "ClientProject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "discoveryCallId" TEXT,
    "clientId" TEXT,
    "projectType" "ClientProjectType" NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '{}',
    "scope" JSONB,
    "status" "ClientProjectStatus" NOT NULL DEFAULT 'SCOPING',
    "sampleHtml" TEXT,
    "sampleUrl" TEXT,
    "finalUrl" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "quotedAmount" INTEGER,
    "invoiceId" TEXT,
    "paymentLinkUrl" TEXT,
    "paymentRef" TEXT,
    "lastReminderAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientProject_discoveryCallId_key" ON "ClientProject"("discoveryCallId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProject_invoiceId_key" ON "ClientProject"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProject_idempotencyKey_key" ON "ClientProject"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ClientProject_companyId_status_idx" ON "ClientProject"("companyId", "status");

-- AddForeignKey
ALTER TABLE "ClientProject" ADD CONSTRAINT "ClientProject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProject" ADD CONSTRAINT "ClientProject_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

