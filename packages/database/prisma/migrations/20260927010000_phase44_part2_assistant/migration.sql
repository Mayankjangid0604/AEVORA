-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" JSONB,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PcTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PcTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssistantMessage_companyId_createdAt_idx" ON "AssistantMessage"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "PcTask_companyId_status_idx" ON "PcTask"("companyId", "status");

-- AddForeignKey
ALTER TABLE "AssistantMessage" DROP CONSTRAINT IF EXISTS "AssistantMessage_companyId_fkey";
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PcTask" DROP CONSTRAINT IF EXISTS "PcTask_companyId_fkey";
ALTER TABLE "PcTask" ADD CONSTRAINT "PcTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
