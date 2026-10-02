import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceType, DeviceStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Generate a short-lived pairing code (Windows → Android) ─────────────
  async generatePairingCode(userId: string, companyId: string) {
    // Expire any previously unused codes for this user
    await this.prisma.devicePairingRequest.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });

    const code = crypto.randomInt(100000, 999999).toString(); // 6-digit code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const pairing = await this.prisma.devicePairingRequest.create({
      data: { code, companyId, userId, expiresAt },
    });

    return { code: pairing.code, expiresAt: pairing.expiresAt };
  }

  // ── Android verifies pairing code and registers itself ───────────────────
  async verifyPairing(code: string, hardwareId: string, deviceName: string) {
    const request = await this.prisma.devicePairingRequest.findUnique({ where: { code } });

    if (!request) throw new NotFoundException('Invalid pairing code');
    if (request.used) throw new BadRequestException('Pairing code already used');
    if (new Date() > request.expiresAt) throw new BadRequestException('Pairing code has expired');

    // Mark as used
    await this.prisma.devicePairingRequest.update({ where: { code }, data: { used: true } });

    // Register the device
    const device = await this.prisma.connectedDevice.upsert({
      where: { hardwareId },
      create: {
        type: DeviceType.ANDROID_DEVICE,
        hardwareId,
        name: deviceName || 'Android Device',
        companyId: request.companyId,
        userId: request.userId,
        status: DeviceStatus.ACTIVE,
      },
      update: {
        status: DeviceStatus.ACTIVE,
        lastSeen: new Date(),
        companyId: request.companyId,
        userId: request.userId,
      },
    });

    return { deviceId: device.id, companyId: device.companyId, userId: device.userId };
  }

  // ── Register / heartbeat for Windows device ──────────────────────────────
  async registerWindowsDevice(userId: string, companyId: string, hardwareId: string, deviceName: string) {
    const device = await this.prisma.connectedDevice.upsert({
      where: { hardwareId },
      create: {
        type: DeviceType.WINDOWS_DEVICE,
        hardwareId,
        name: deviceName || 'Windows Device',
        companyId,
        userId,
        status: DeviceStatus.ACTIVE,
      },
      update: {
        status: DeviceStatus.ACTIVE,
        lastSeen: new Date(),
      },
    });
    return device;
  }

  // ── List all devices for a company ───────────────────────────────────────
  async listDevices(companyId: string) {
    return this.prisma.connectedDevice.findMany({
      where: { companyId, status: { not: DeviceStatus.REVOKED } },
      orderBy: { lastSeen: 'desc' },
    });
  }

  // ── Revoke a device ──────────────────────────────────────────────────────
  async revokeDevice(deviceId: string, requestingUserId: string) {
    const device = await this.prisma.connectedDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');
    if (device.userId !== requestingUserId) throw new ForbiddenException('Cannot revoke another user\'s device');

    return this.prisma.connectedDevice.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.REVOKED },
    });
  }

  // ── Update heartbeat ─────────────────────────────────────────────────────
  async heartbeat(deviceId: string) {
    return this.prisma.connectedDevice.update({
      where: { id: deviceId },
      data: { lastSeen: new Date() },
    });
  }
}
