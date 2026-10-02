-- AlterTable
ALTER TABLE "SalesLead" ADD COLUMN "googlePlaceId" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "qualityScore" INTEGER,
ADD COLUMN "lastContactedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LeadGenRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" TEXT NOT NULL DEFAULT 'SCHEDULE',
    "error" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalNew" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LeadGenRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadGenAudit" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadGenAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesLead_companyId_googlePlaceId_key" ON "SalesLead"("companyId", "googlePlaceId");
CREATE INDEX "SalesLead_companyId_status_qualityScore_idx" ON "SalesLead"("companyId", "status", "qualityScore");
CREATE INDEX "LeadGenRun_companyId_triggeredAt_idx" ON "LeadGenRun"("companyId", "triggeredAt");
CREATE INDEX "LeadGenAudit_leadId_idx" ON "LeadGenAudit"("leadId");

-- AddForeignKey
ALTER TABLE "LeadGenRun" ADD CONSTRAINT "LeadGenRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadGenAudit" ADD CONSTRAINT "LeadGenAudit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
