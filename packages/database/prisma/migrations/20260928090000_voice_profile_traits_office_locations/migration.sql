-- Brings the DB in line with schema.prisma: VoiceProfile trait columns (voice.service),
-- OfficeLocation + Employee.locationId (company-movement.service). Idempotent so it is
-- safe on a DB that was partly synced with `prisma db push`.

-- VoiceProfile traits
ALTER TABLE "VoiceProfile" ADD COLUMN IF NOT EXISTS "providerVoiceId" TEXT;
ALTER TABLE "VoiceProfile" ADD COLUMN IF NOT EXISTS "voiceFamily" TEXT;
ALTER TABLE "VoiceProfile" ADD COLUMN IF NOT EXISTS "warmth" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "VoiceProfile" ADD COLUMN IF NOT EXISTS "authority" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "VoiceProfile" ADD COLUMN IF NOT EXISTS "energy" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "VoiceProfile" ADD COLUMN IF NOT EXISTS "formality" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- LocationType enum
DO $$ BEGIN
  CREATE TYPE "LocationType" AS ENUM ('OFFICE', 'DEPARTMENT', 'MEETING_ROOM', 'CAFETERIA', 'RECEPTION', 'HALLWAY', 'DESK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- OfficeLocation
CREATE TABLE IF NOT EXISTS "OfficeLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfficeLocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

DO $$ BEGIN
  ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
