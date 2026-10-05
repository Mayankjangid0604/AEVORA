-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('COMPLAINT', 'REVIEW');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ComplianceKind" AS ENUM ('GST', 'TDS', 'ROC', 'INCOME_TAX', 'PF_ESI', 'OTHER');

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "customerName" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "subject" TEXT NOT NULL,
    "details" TEXT,
    "rating" INTEGER,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "ComplianceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "filedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerFeedback_companyId_kind_createdAt_idx" ON "CustomerFeedback"("companyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceFiling_companyId_dueDate_idx" ON "ComplianceFiling"("companyId", "dueDate");

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
