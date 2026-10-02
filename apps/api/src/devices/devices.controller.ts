import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard, Public } from '../authorization/jwt-auth.guard';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // ── Pairing: Windows generates a short-lived code ────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('pairing/generate')
  async generatePairingCode(@Request() req: any) {
    const { actorId: userId, companyId } = req.user;
    return this.devicesService.generatePairingCode(userId, companyId);
  }

  // ── Pairing: Android submits code + hardware info ────────────────────────
  @Public()
  @Post('pairing/verify')
  async verifyPairing(
    @Body() body: { code: string; hardwareId: string; deviceName?: string },
  ) {
    return this.devicesService.verifyPairing(
      body.code,
      body.hardwareId,
      body.deviceName || 'Android Device',
    );
  }

  // ── Windows self-registers ───────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('register/windows')
  async registerWindows(
    @Request() req: any,
    @Body() body: { hardwareId: string; deviceName?: string },
  ) {
    const { actorId: userId, companyId } = req.user;
    return this.devicesService.registerWindowsDevice(
      userId,
      companyId,
      body.hardwareId,
      body.deviceName || 'Windows Device',
    );
  }

  // ── List all devices for the company ────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get()
  async listDevices(@Request() req: any) {
    const { companyId } = req.user;
    return this.devicesService.listDevices(companyId);
  }

  // ── Revoke a device ──────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async revokeDevice(@Param('id') id: string, @Request() req: any) {
    const { actorId: userId } = req.user;
    return this.devicesService.revokeDevice(id, userId);
  }

  // ── Heartbeat (no auth; device uses its own ID) ──────────────────────────
  @Post(':id/heartbeat')
  async heartbeat(@Param('id') id: string) {
    return this.devicesService.heartbeat(id);
  }
}
