-- AlterEnum
ALTER TYPE "InboundMessageStatus" ADD VALUE 'REPLIED';

-- AlterTable
ALTER TABLE "InboundMessage" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "draftReply" TEXT,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "replySentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_companyId_messageId_key" ON "InboundMessage"("companyId", "messageId");

