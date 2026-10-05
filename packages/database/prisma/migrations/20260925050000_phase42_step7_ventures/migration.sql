-- CreateEnum
CREATE TYPE "VentureStatus" AS ENUM ('FORMING', 'ACTIVE', 'PAUSED', 'CLOSED', 'FAILED');

-- CreateTable
CREATE TABLE "Venture" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" JSONB NOT NULL DEFAULT '{}',
    "teamSize" INTEGER NOT NULL DEFAULT 0,
    "departmentId" TEXT,
    "firstTaskId" TEXT,
    "status" "VentureStatus" NOT NULL DEFAULT 'FORMING',
    "chairmanApproved" BOOLEAN NOT NULL DEFAULT false,
    "voiceCommandId" TEXT,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentureTeam" (
    "id" TEXT NOT NULL,
    "ventureId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentureTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venture_voiceCommandId_key" ON "Venture"("voiceCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "Venture_idempotencyKey_key" ON "Venture"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Venture_companyId_status_idx" ON "Venture"("companyId", "status");

-- CreateIndex
CREATE INDEX "VentureTeam_employeeId_idx" ON "VentureTeam"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "VentureTeam_ventureId_employeeId_key" ON "VentureTeam"("ventureId", "employeeId");

-- AddForeignKey
ALTER TABLE "Venture" ADD CONSTRAINT "Venture_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentureTeam" ADD CONSTRAINT "VentureTeam_ventureId_fkey" FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentureTeam" ADD CONSTRAINT "VentureTeam_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

