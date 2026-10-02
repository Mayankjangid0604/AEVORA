CREATE TABLE IF NOT EXISTS "DemoSite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "vercelProjectId" TEXT,
    "projectName" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BUILDING',
    "error" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DemoSite_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DemoSite_companyId_status_createdAt_idx" ON "DemoSite"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DemoSite_leadId_idx" ON "DemoSite"("leadId");

CREATE TABLE IF NOT EXISTS "ChairmanMail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "emailMessageId" TEXT,
    "emailedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChairmanMail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChairmanMail_ref_key" ON "ChairmanMail"("ref");
CREATE INDEX IF NOT EXISTS "ChairmanMail_companyId_status_createdAt_idx" ON "ChairmanMail"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ChairmanMail_emailMessageId_idx" ON "ChairmanMail"("emailMessageId");

CREATE TABLE IF NOT EXISTS "ChairmanMailMessage" (
    "id" TEXT NOT NULL,
    "mailId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "emailMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChairmanMailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChairmanMailMessage_emailMessageId_key" ON "ChairmanMailMessage"("emailMessageId");
CREATE INDEX IF NOT EXISTS "ChairmanMailMessage_mailId_createdAt_idx" ON "ChairmanMailMessage"("mailId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ChairmanMailMessage" ADD CONSTRAINT "ChairmanMailMessage_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "ChairmanMail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
