-- CreateEnum
CREATE TYPE "VoiceCommandStatus" AS ENUM ('RECEIVED', 'EXECUTED', 'PENDING', 'FAILED');

-- CreateTable
CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "commandCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT,
    "actorId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "intent" JSONB NOT NULL DEFAULT '{}',
    "routedTo" TEXT,
    "response" TEXT,
    "error" TEXT,
    "status" "VoiceCommandStatus" NOT NULL DEFAULT 'RECEIVED',
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceSession_companyId_startedAt_idx" ON "VoiceSession"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "VoiceCommand_companyId_status_createdAt_idx" ON "VoiceCommand"("companyId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCommand" ADD CONSTRAINT "VoiceCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCommand" ADD CONSTRAINT "VoiceCommand_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

