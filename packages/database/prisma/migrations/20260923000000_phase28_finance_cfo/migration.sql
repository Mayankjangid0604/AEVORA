-- Phase 28: Autonomous Finance & CFO

-- Enums
CREATE TYPE "FinancialPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'VOID');
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CANCELLED');
CREATE TYPE "FinancePaymentRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXECUTED', 'SETTLED', 'CANCELLED', 'FAILED');
CREATE TYPE "ForecastType" AS ENUM ('REVENUE', 'EXPENSE', 'CASH_FLOW', 'RUNWAY', 'PROFIT_LOSS');
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'PARTIALLY_MATCHED', 'DISCREPANCY', 'RESOLVED');
CREATE TYPE "CFORecommendationCategory" AS ENUM ('CASH_MANAGEMENT', 'COST_REDUCTION', 'REVENUE_ACCELERATION', 'COLLECTION_ACTION', 'BUDGET_ADJUSTMENT', 'RISK_ALERT', 'FORECAST_UPDATE', 'PAYABLE_MANAGEMENT');

-- FinancialPeriod
CREATE TABLE "FinancialPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialPeriod_companyId_name_key" ON "FinancialPeriod"("companyId", "name");
CREATE INDEX "FinancialPeriod_companyId_status_idx" ON "FinancialPeriod"("companyId", "status");
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FinancialAccount
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialAccount_companyId_code_key" ON "FinancialAccount"("companyId", "code");
CREATE INDEX "FinancialAccount_companyId_type_idx" ON "FinancialAccount"("companyId", "type");
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JournalEntry
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "source" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "reversalOf" TEXT,
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JournalEntry_companyId_entryNumber_key" ON "JournalEntry"("companyId", "entryNumber");
CREATE INDEX "JournalEntry_companyId_status_idx" ON "JournalEntry"("companyId", "status");
CREATE INDEX "JournalEntry_companyId_date_idx" ON "JournalEntry"("companyId", "date");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancialPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- JournalLine
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bill
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorRef" TEXT,
    "billNumber" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "approvalId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Bill_companyId_status_idx" ON "Bill"("companyId", "status");
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FinancePaymentRequest
CREATE TABLE "FinancePaymentRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billId" TEXT,
    "invoiceId" TEXT,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryRef" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "purpose" TEXT NOT NULL,
    "status" "FinancePaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "sandboxMode" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancePaymentRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancePaymentRequest_idempotencyKey_key" ON "FinancePaymentRequest"("idempotencyKey");
CREATE INDEX "FinancePaymentRequest_companyId_status_idx" ON "FinancePaymentRequest"("companyId", "status");
ALTER TABLE "FinancePaymentRequest" ADD CONSTRAINT "FinancePaymentRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePaymentRequest" ADD CONSTRAINT "FinancePaymentRequest_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FinancialForecast
CREATE TABLE "FinancialForecast" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "forecastType" "ForecastType" NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "dataSource" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    CONSTRAINT "FinancialForecast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinancialForecast_companyId_forecastType_period_idx" ON "FinancialForecast"("companyId", "forecastType", "period");
ALTER TABLE "FinancialForecast" ADD CONSTRAINT "FinancialForecast_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FinancialReconciliation
CREATE TABLE "FinancialReconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT,
    "period" TEXT NOT NULL,
    "observedRef" TEXT,
    "observedAmount" INTEGER NOT NULL,
    "ledgerAmount" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "notes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinancialReconciliation_companyId_status_idx" ON "FinancialReconciliation"("companyId", "status");
ALTER TABLE "FinancialReconciliation" ADD CONSTRAINT "FinancialReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialReconciliation" ADD CONSTRAINT "FinancialReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FinancialAuditEvent
CREATE TABLE "FinancialAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'HUMAN',
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reference" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinancialAuditEvent_companyId_objectType_objectId_idx" ON "FinancialAuditEvent"("companyId", "objectType", "objectId");
CREATE INDEX "FinancialAuditEvent_companyId_timestamp_idx" ON "FinancialAuditEvent"("companyId", "timestamp");
ALTER TABLE "FinancialAuditEvent" ADD CONSTRAINT "FinancialAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CFORecommendation
CREATE TABLE "CFORecommendation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "CFORecommendationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reasoning" TEXT,
    "dataSnapshot" JSONB,
    "isAdvisory" BOOLEAN NOT NULL DEFAULT true,
    "isActedOn" BOOLEAN NOT NULL DEFAULT false,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "disclaimer" TEXT NOT NULL DEFAULT 'AI RECOMMENDATION ONLY',
    CONSTRAINT "CFORecommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CFORecommendation_companyId_category_idx" ON "CFORecommendation"("companyId", "category");
ALTER TABLE "CFORecommendation" ADD CONSTRAINT "CFORecommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
