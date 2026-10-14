-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "ClientInquiry" ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "publicRef" TEXT,
ADD COLUMN     "serviceRequested" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "submissionHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClientInquiry_publicRef_key" ON "ClientInquiry"("publicRef");

-- CreateIndex
CREATE INDEX "ClientInquiry_companyId_status_receivedAt_idx" ON "ClientInquiry"("companyId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "ClientInquiry_companyId_submissionHash_idx" ON "ClientInquiry"("companyId", "submissionHash");

