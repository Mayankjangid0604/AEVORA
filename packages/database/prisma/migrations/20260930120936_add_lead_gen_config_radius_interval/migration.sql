-- Add configurable radius and interval to LeadGenConfig
ALTER TABLE "LeadGenConfig" ADD COLUMN "radiusM" INTEGER,
ADD COLUMN "intervalHours" DOUBLE PRECISION;

-- Add comments for clarity (PostgreSQL syntax)
COMMENT ON COLUMN "LeadGenConfig"."radiusM" IS 'Search radius in metres; null = LEAD_GEN_RADIUS_M env / 50000';
COMMENT ON COLUMN "LeadGenConfig"."intervalHours" IS 'Cooldown between auto-runs in hours; null = LEAD_GEN_INTERVAL_HOURS env / 6';
