-- CreateEnum
CREATE TYPE "CeoQuestionUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CeoQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'USED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CeoQuestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ceoReviewId" TEXT,
    "question" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "urgency" "CeoQuestionUrgency" NOT NULL DEFAULT 'MEDIUM',
    "status" "CeoQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "chairmanAnswer" TEXT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "CeoQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CeoQuestion_companyId_status_idx" ON "CeoQuestion"("companyId", "status");

-- AddForeignKey
ALTER TABLE "CeoQuestion" ADD CONSTRAINT "CeoQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

