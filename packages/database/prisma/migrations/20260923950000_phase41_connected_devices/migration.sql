-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('WINDOWS_DEVICE', 'ANDROID_DEVICE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "ConnectedDevice" (
    "id" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "hardwareId" TEXT NOT NULL,
    "name" TEXT,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairingRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DevicePairingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedDevice_hardwareId_key" ON "ConnectedDevice"("hardwareId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairingRequest_code_key" ON "DevicePairingRequest"("code");

-- AddForeignKey
ALTER TABLE "ConnectedDevice" ADD CONSTRAINT "ConnectedDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedDevice" ADD CONSTRAINT "ConnectedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Chairman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
