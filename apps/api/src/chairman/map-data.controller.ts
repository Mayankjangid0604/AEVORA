import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put, Request, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildPins } from './map-data';

const LEAD_FIELDS = { id: true, name: true, status: true, industry: true, geography: true, metadata: true } as const;

@Controller('map')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class MapDataController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('pins')
  async pins(@Request() req) {
    const companyId = req.user.companyId;
    const [leads, projects] = await Promise.all([
      this.prisma.salesLead.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 500, select: LEAD_FIELDS }),
      this.prisma.clientProject.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' }, // later projects overwrite earlier ones for the same business
        take: 500,
        select: { id: true, status: true, quotedAmount: true, lead: { select: LEAD_FIELDS } },
      }),
    ]);
    return buildPins(leads, projects);
  }

  /** Chairman sets a client's / lead's exact location (shown on the maps and the R&D globe). */
  @Put('leads/:id/location')
  async setLocation(@Request() req, @Param('id') id: string, @Body() body: { lat: number; lng: number }) {
    const lat = Number(body?.lat), lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new BadRequestException('lat must be -90..90 and lng -180..180');
    const lead = await this.prisma.salesLead.findFirst({ where: { id, companyId: req.user.companyId }, select: { id: true, metadata: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const metadata = { ...((lead.metadata as Record<string, unknown>) ?? {}), lat, lng, geoSource: 'manual' } as Prisma.InputJsonValue;
    await this.prisma.salesLead.update({ where: { id }, data: { metadata } });
    return { id, lat, lng, geoSource: 'manual' };
  }
}
