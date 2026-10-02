-- AlterTable
ALTER TABLE "OutreachScript" ADD COLUMN     "evaluatedAtCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "responseRatePct" INTEGER;

-- AlterTable
ALTER TABLE "LeadGenConfig" ADD COLUMN     "dropped" TEXT[],
ADD COLUMN     "weights" JSONB NOT NULL DEFAULT '{}';

