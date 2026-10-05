import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { MpProviderType, MpProviderStatus, EmployeeStatus } from '@prisma/client';

const SAFE_PROVIDER_SELECT = {
  id: true, companyId: true, providerType: true, displayName: true, description: true,
  baseUrl: true, status: true, isGlobal: true, createdBy: true, createdAt: true, updatedAt: true,
  // encryptedApiKeyRef does not exist in schema — never stored or returned
};

@Injectable()
export class MpProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async register(companyId: string, actorId: string, dto: {
    providerType: MpProviderType;
    displayName: string;
    description?: string;
    baseUrl?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const existing = await this.prisma.mpProvider.findFirst({
      where: { companyId, providerType: dto.providerType, displayName: dto.displayName },
    });
    if (existing) throw new ConflictException('Provider already registered with this name');

    const provider = await this.prisma.mpProvider.create({
      data: {
        companyId,
        providerType: dto.providerType,
        displayName: dto.displayName,
        description: dto.description,
        baseUrl: dto.baseUrl,
        status: MpProviderStatus.ACTIVE,
        createdBy: actorId,
      },
      select: SAFE_PROVIDER_SELECT,
    });
    await this.audit.record({ companyId, actorId, action: 'MP_PROVIDER_REGISTERED', objectType: 'MpProvider', objectId: provider.id, newValue: { providerType: provider.providerType, displayName: provider.displayName } });
    return provider;
  }

  async list(companyId: string, providerType?: MpProviderType) {
    return this.prisma.mpProvider.findMany({
      where: { companyId, ...(providerType ? { providerType } : {}) },
      select: SAFE_PROVIDER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, providerId: string) {
    const p = await this.prisma.mpProvider.findUnique({ where: { id: providerId }, select: SAFE_PROVIDER_SELECT });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Provider not found');
    return p;
  }

  async setStatus(companyId: string, actorId: string, providerId: string, status: MpProviderStatus) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.mpProvider.findUnique({ where: { id: providerId }, select: { id: true, companyId: true, status: true } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Provider not found');
    await this.prisma.mpProvider.update({ where: { id: providerId }, data: { status } });
    await this.audit.record({ companyId, actorId, action: 'MP_PROVIDER_STATUS_CHANGED', objectType: 'MpProvider', objectId: providerId, oldValue: { status: p.status }, newValue: { status } });
    return { id: p.id, status };
  }
}
