-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ceoEmployeeId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "leadsFoundCount" INTEGER NOT NULL DEFAULT 0,
    "leadsContactedCount" INTEGER NOT NULL DEFAULT 0,
    "dealsWonCount" INTEGER NOT NULL DEFAULT 0,
    "revenueEarnedPaise" INTEGER NOT NULL DEFAULT 0,
    "topPerformingCategory" TEXT,
    "biggestChallenge" TEXT NOT NULL,
    "ceoCommentary" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyReport_companyId_createdAt_idx" ON "WeeklyReport"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_companyId_weekStartDate_key" ON "WeeklyReport"("companyId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

