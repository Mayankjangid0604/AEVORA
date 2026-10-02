-- CreateTable
CREATE TABLE IF NOT EXISTS "StartupIdea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CHAIRMAN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "problem" TEXT,
    "targetMarket" TEXT,
    "estimatedBudget" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ceoEvaluation" TEXT,
    "ceoScore" INTEGER,
    "ceoQuestion" TEXT,
    "chairmanReply" TEXT,
    "ventureId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StartupIdea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StartupIdea_companyId_status_idx" ON "StartupIdea"("companyId", "status");
CREATE INDEX IF NOT EXISTS "StartupIdea_companyId_createdAt_idx" ON "StartupIdea"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "StartupIdea" DROP CONSTRAINT IF EXISTS "StartupIdea_companyId_fkey";
ALTER TABLE "StartupIdea" ADD CONSTRAINT "StartupIdea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StartupIdea" DROP CONSTRAINT IF EXISTS "StartupIdea_ventureId_fkey";
ALTER TABLE "StartupIdea" ADD CONSTRAINT "StartupIdea_ventureId_fkey" FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
