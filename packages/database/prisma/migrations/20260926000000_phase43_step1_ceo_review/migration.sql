-- CreateTable
CREATE TABLE "CeoReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ceoEmployeeId" TEXT NOT NULL,
    "simHour" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "leadsContacted" INTEGER NOT NULL DEFAULT 0,
    "leadsQualified" INTEGER NOT NULL DEFAULT 0,
    "dealsInProgress" INTEGER NOT NULL DEFAULT 0,
    "paidThisWeek" INTEGER NOT NULL DEFAULT 0,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "survivalStatus" TEXT NOT NULL,
    "topRisk" TEXT NOT NULL,
    "topOpportunity" TEXT NOT NULL,
    "decisionsProposed" JSONB NOT NULL DEFAULT '[]',
    "weeklyReport" TEXT NOT NULL,
    "sentToChairman" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CeoReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadGenConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categories" TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadGenConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CeoReview_companyId_reviewedAt_idx" ON "CeoReview"("companyId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CeoReview_companyId_simHour_key" ON "CeoReview"("companyId", "simHour");

-- CreateIndex
CREATE UNIQUE INDEX "LeadGenConfig_companyId_key" ON "LeadGenConfig"("companyId");

-- AddForeignKey
ALTER TABLE "CeoReview" ADD CONSTRAINT "CeoReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadGenConfig" ADD CONSTRAINT "LeadGenConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

