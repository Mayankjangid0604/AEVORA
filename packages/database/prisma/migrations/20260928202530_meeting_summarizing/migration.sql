-- AlterEnum
ALTER TYPE "MeetingStatus" ADD VALUE 'SUMMARIZING';

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "summaryError" TEXT;
