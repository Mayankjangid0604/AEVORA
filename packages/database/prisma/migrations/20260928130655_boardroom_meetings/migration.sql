-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('STANDARD', 'BOARD');

-- CreateEnum
CREATE TYPE "MeetingImportance" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MeetingLeader" AS ENUM ('CHAIRMAN', 'ASSISTANT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MeetingStatus" ADD VALUE 'NOTIFIED';
ALTER TYPE "MeetingStatus" ADD VALUE 'RESCHEDULED';

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "currentAgendaIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deckId" TEXT,
ADD COLUMN     "importance" "MeetingImportance" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "kind" "MeetingKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "ledBy" "MeetingLeader",
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryBriefedAt" TIMESTAMP(3),
ADD COLUMN     "summaryDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "summaryFilePath" TEXT,
ADD COLUMN     "transcript" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "Meeting_companyId_kind_status_idx" ON "Meeting"("companyId", "kind", "status");
