-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdByEmployeeId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "contentType" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "imagePrompt" TEXT,
    "imageDescription" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "weekNumber" INTEGER,
    "year" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCalendar" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "posts" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPost_companyId_status_idx" ON "ContentPost"("companyId", "status");

-- CreateIndex
CREATE INDEX "ContentPost_companyId_weekNumber_year_idx" ON "ContentPost"("companyId", "weekNumber", "year");

-- CreateIndex
CREATE INDEX "ContentCalendar_companyId_year_idx" ON "ContentCalendar"("companyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCalendar_companyId_weekNumber_year_key" ON "ContentCalendar"("companyId", "weekNumber", "year");

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendar" ADD CONSTRAINT "ContentCalendar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

