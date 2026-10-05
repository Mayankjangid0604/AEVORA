ALTER TABLE "OutreachCampaign" ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT;
CREATE INDEX IF NOT EXISTS "OutreachCampaign_emailMessageId_idx" ON "OutreachCampaign"("emailMessageId");
