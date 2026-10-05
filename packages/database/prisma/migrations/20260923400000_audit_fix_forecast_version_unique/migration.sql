-- Audit fix: enforce unique forecast versions per company+forecastType
-- Prevents concurrent createForecast calls from producing duplicate version numbers (M01)

-- Step 1: Renumber any duplicate versions by reassigning them sequentially
-- (Test data may have duplicates from the pre-fix race window)
WITH ranked AS (
  SELECT id,
         "companyId",
         "forecastType",
         ROW_NUMBER() OVER (
           PARTITION BY "companyId", "forecastType"
           ORDER BY "createdAt", id
         ) AS new_version
  FROM "StrategicForecast"
)
UPDATE "StrategicForecast" sf
SET version = ranked.new_version
FROM ranked
WHERE sf.id = ranked.id
  AND sf.version != ranked.new_version;

-- Step 2: Drop old non-unique index
DROP INDEX IF EXISTS "StrategicForecast_companyId_forecastType_version_idx";

-- Step 3: Add unique constraint
CREATE UNIQUE INDEX "StrategicForecast_companyId_forecastType_version_key"
  ON "StrategicForecast"("companyId", "forecastType", "version");
