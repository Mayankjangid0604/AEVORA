-- CreateEnum
CREATE TYPE "GoEntityType" AS ENUM ('HEADQUARTERS', 'REGIONAL_OFFICE', 'SUBSIDIARY', 'BRANCH', 'REPRESENTATIVE_OFFICE', 'JOINT_VENTURE');

-- CreateEnum
CREATE TYPE "GoOperationalStatus" AS ENUM ('PLANNING', 'ACTIVE', 'SUSPENDED', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "GoRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GoComplianceStatus" AS ENUM ('COMPLIANT', 'UNDER_REVIEW', 'NON_COMPLIANT', 'REMEDIATION');

-- CreateTable
CREATE TABLE "GoRegion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "timeZone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "GoOperationalStatus" NOT NULL DEFAULT 'ACTIVE',
    "managerId" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoCountry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timeZone" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoOperatingEntity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "countryId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "entityType" "GoEntityType" NOT NULL DEFAULT 'BRANCH',
    "status" "GoOperationalStatus" NOT NULL DEFAULT 'PLANNING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timeZone" TEXT,
    "address" TEXT,
    "registrationNumber" TEXT,
    "managerId" TEXT,
    "parentEntityId" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
    "registeredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoOperatingEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoRegionalKpi" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentValue" TEXT,
    "targetValue" TEXT,
    "unit" TEXT,
    "period" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoRegionalKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoRegionalRisk" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "riskLevel" "GoRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT,
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "raisedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoRegionalRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoRegionalBudget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalQuarter" INTEGER,
    "allocatedMc" INTEGER NOT NULL,
    "forecastedMc" INTEGER,
    "actualMc" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoRegionalBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoComplianceRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "status" "GoComplianceStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "resolvedBy" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoFxRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rateMc" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoFxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT,
    "entityId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoRegion_companyId_status_idx" ON "GoRegion"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoRegion_companyId_code_key" ON "GoRegion"("companyId", "code");

-- CreateIndex
CREATE INDEX "GoCountry_companyId_regionId_idx" ON "GoCountry"("companyId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "GoCountry_companyId_regionId_isoCode_key" ON "GoCountry"("companyId", "regionId", "isoCode");

-- CreateIndex
CREATE INDEX "GoOperatingEntity_companyId_regionId_status_idx" ON "GoOperatingEntity"("companyId", "regionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoOperatingEntity_companyId_code_key" ON "GoOperatingEntity"("companyId", "code");

-- CreateIndex
CREATE INDEX "GoRegionalKpi_companyId_regionId_idx" ON "GoRegionalKpi"("companyId", "regionId");

-- CreateIndex
CREATE INDEX "GoRegionalRisk_companyId_regionId_idx" ON "GoRegionalRisk"("companyId", "regionId");

-- CreateIndex
CREATE INDEX "GoRegionalBudget_companyId_regionId_idx" ON "GoRegionalBudget"("companyId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "GoRegionalBudget_companyId_regionId_fiscalYear_fiscalQuarte_key" ON "GoRegionalBudget"("companyId", "regionId", "fiscalYear", "fiscalQuarter");

-- CreateIndex
CREATE INDEX "GoComplianceRecord_companyId_entityId_idx" ON "GoComplianceRecord"("companyId", "entityId");

-- CreateIndex
CREATE INDEX "GoFxRate_companyId_fromCurrency_toCurrency_effectiveAt_idx" ON "GoFxRate"("companyId", "fromCurrency", "toCurrency", "effectiveAt");

-- CreateIndex
CREATE INDEX "GoAuditEvent_companyId_regionId_idx" ON "GoAuditEvent"("companyId", "regionId");

-- CreateIndex
CREATE INDEX "GoAuditEvent_companyId_createdAt_idx" ON "GoAuditEvent"("companyId", "createdAt");


-- AddForeignKey
ALTER TABLE "GoRegion" ADD CONSTRAINT "GoRegion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoCountry" ADD CONSTRAINT "GoCountry_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GoRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoOperatingEntity" ADD CONSTRAINT "GoOperatingEntity_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GoRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoOperatingEntity" ADD CONSTRAINT "GoOperatingEntity_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "GoCountry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoOperatingEntity" ADD CONSTRAINT "GoOperatingEntity_parentEntityId_fkey" FOREIGN KEY ("parentEntityId") REFERENCES "GoOperatingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoRegionalKpi" ADD CONSTRAINT "GoRegionalKpi_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GoRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoRegionalRisk" ADD CONSTRAINT "GoRegionalRisk_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GoRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoRegionalBudget" ADD CONSTRAINT "GoRegionalBudget_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GoRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoComplianceRecord" ADD CONSTRAINT "GoComplianceRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "GoOperatingEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoAuditEvent" ADD CONSTRAINT "GoAuditEvent_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoAuditEvent" ADD CONSTRAINT "GoAuditEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "GoOperatingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

