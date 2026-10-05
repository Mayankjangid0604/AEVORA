-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'browser',
    "voiceId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "accent" TEXT,
    "pitch" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "speakingRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "stability" DOUBLE PRECISION,
    "expressiveness" DOUBLE PRECISION,
    "style" TEXT,
    "personalityInfluence" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceProfile_employeeId_key" ON "VoiceProfile"("employeeId");

-- AddForeignKey
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
