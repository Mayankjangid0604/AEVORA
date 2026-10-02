CREATE TABLE IF NOT EXISTS "ClientProjectStaff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "ClientProjectStaff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientProjectStaff_companyId_releasedAt_idx" ON "ClientProjectStaff"("companyId", "releasedAt");
CREATE INDEX IF NOT EXISTS "ClientProjectStaff_projectId_idx" ON "ClientProjectStaff"("projectId");
CREATE INDEX IF NOT EXISTS "ClientProjectStaff_employeeId_releasedAt_idx" ON "ClientProjectStaff"("employeeId", "releasedAt");

CREATE TABLE IF NOT EXISTS "RoleSeat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleSeat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoleSeat_companyId_roleTitle_key" ON "RoleSeat"("companyId", "roleTitle");

CREATE TABLE IF NOT EXISTS "ChairmanAlert" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChairmanAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChairmanAlert_companyId_key_createdAt_idx" ON "ChairmanAlert"("companyId", "key", "createdAt");
