-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "productService" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isChairmanGated" BOOLEAN NOT NULL DEFAULT false,
    "requiresChairmanApproval" BOOLEAN NOT NULL DEFAULT false,
    "currentRedemptions" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "termsVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "rejectionReason" TEXT,
    "suspensionReason" TEXT,
    "dispatchedActionId" TEXT,
    "externalReferenceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "financialAnalysis" JSONB,
    "ceoEvaluation" JSONB,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferMaterialTermsRecord" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "maxRedemptions" INTEGER,
    "productServiceIds" JSONB NOT NULL DEFAULT '[]',
    "targetAudience" TEXT NOT NULL,
    "termsAndConditions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferMaterialTermsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferTermsVersion" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "terms" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferTermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferApprovalRecord" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverTier" TEXT NOT NULL,
    "approvedVersion" INTEGER NOT NULL,
    "approvedTermsVersion" INTEGER NOT NULL,
    "parametersHash" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "validUntil" TIMESTAMP(3),
    "isConsumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferConsumedApproval" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "consumedBy" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferConsumedApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferRedemptionRecord" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "redemptionCode" TEXT NOT NULL,
    "transactionValue" DOUBLE PRECISION NOT NULL,
    "discountApplied" DOUBLE PRECISION NOT NULL,
    "netPaid" DOUBLE PRECISION NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'DIRECT_WEB',
    "evidenceHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferRedemptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_companyId_status_idx" ON "Offer"("companyId", "status");

-- CreateIndex
CREATE INDEX "Offer_companyId_createdAt_idx" ON "Offer"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_companyId_idempotencyKey_key" ON "Offer"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OfferMaterialTermsRecord_offerId_key" ON "OfferMaterialTermsRecord"("offerId");

-- CreateIndex
CREATE INDEX "OfferMaterialTermsRecord_offerId_idx" ON "OfferMaterialTermsRecord"("offerId");

-- CreateIndex
CREATE INDEX "OfferTermsVersion_offerId_version_idx" ON "OfferTermsVersion"("offerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OfferTermsVersion_offerId_version_key" ON "OfferTermsVersion"("offerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OfferApprovalRecord_approvalId_key" ON "OfferApprovalRecord"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferApprovalRecord_offerId_key" ON "OfferApprovalRecord"("offerId");

-- CreateIndex
CREATE INDEX "OfferApprovalRecord_offerId_parametersHash_idx" ON "OfferApprovalRecord"("offerId", "parametersHash");

-- CreateIndex
CREATE UNIQUE INDEX "OfferConsumedApproval_approvalId_key" ON "OfferConsumedApproval"("approvalId");

-- CreateIndex
CREATE INDEX "OfferConsumedApproval_approvalId_idx" ON "OfferConsumedApproval"("approvalId");

-- CreateIndex
CREATE INDEX "OfferRedemptionRecord_offerId_customerId_idx" ON "OfferRedemptionRecord"("offerId", "customerId");

-- CreateIndex
CREATE INDEX "OfferRedemptionRecord_companyId_redeemedAt_idx" ON "OfferRedemptionRecord"("companyId", "redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRedemptionRecord_companyId_idempotencyKey_key" ON "OfferRedemptionRecord"("companyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferMaterialTermsRecord" ADD CONSTRAINT "OfferMaterialTermsRecord_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferTermsVersion" ADD CONSTRAINT "OfferTermsVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferApprovalRecord" ADD CONSTRAINT "OfferApprovalRecord_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemptionRecord" ADD CONSTRAINT "OfferRedemptionRecord_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemptionRecord" ADD CONSTRAINT "OfferRedemptionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
