-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "ACTransaction_fromWalletId_idx" ON "ACTransaction"("fromWalletId");

-- CreateIndex
CREATE INDEX "ACTransaction_toWalletId_idx" ON "ACTransaction"("toWalletId");

-- CreateIndex
CREATE INDEX "RealMoneyTransaction_accountId_idx" ON "RealMoneyTransaction"("accountId");

-- CreateIndex
CREATE INDEX "RevenueRecord_companyId_idx" ON "RevenueRecord"("companyId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE INDEX "DiscoveryCall_leadId_idx" ON "DiscoveryCall"("leadId");

-- CreateIndex
CREATE INDEX "ClientProject_leadId_idx" ON "ClientProject"("leadId");

-- CreateIndex
CREATE INDEX "ConnectedDevice_userId_idx" ON "ConnectedDevice"("userId");

