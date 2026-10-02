import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class MpPromptTemplateService {
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

  async create(companyId: string, actorId: string, dto: {
    name: string;
    description?: string;
    category?: string;
    systemPrompt?: string;
    userTemplate: string;
    variables?: unknown[];
  }) {
    await this.verifyActor(actorId, companyId);
    const existing = await this.prisma.mpPromptTemplate.findFirst({ where: { companyId, name: dto.name } });
    if (existing) throw new ConflictException('Prompt template name already exists');

    const template = await this.prisma.mpPromptTemplate.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        category: dto.category ?? 'GENERAL',
        createdBy: actorId,
      },
    });

    // Create initial version
    await this.prisma.mpPromptTemplateVersion.create({
      data: {
        companyId,
        templateId: template.id,
        version: 1,
        systemPrompt: dto.systemPrompt,
        userTemplate: dto.userTemplate,
        variables: (dto.variables ?? []) as any,
        createdBy: actorId,
        isActive: true,
        isAdvisory: true,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'MP_PROMPT_TEMPLATE_CREATED', objectType: 'MpPromptTemplate', objectId: template.id, newValue: { name: template.name } });
    return { ...template, currentVersion: 1, isAdvisory: true };
  }

  async list(companyId: string) {
    return this.prisma.mpPromptTemplate.findMany({
      where: { companyId },
      include: { versions: { select: { version: true, isActive: true, createdAt: true }, orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(companyId: string, templateId: string) {
    const t = await this.prisma.mpPromptTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!t || t.companyId !== companyId) throw new NotFoundException('Template not found');
    return t;
  }

  async newVersion(companyId: string, actorId: string, templateId: string, dto: {
    systemPrompt?: string;
    userTemplate: string;
    variables?: unknown[];
  }) {
    await this.verifyActor(actorId, companyId);
    const t = await this.prisma.mpPromptTemplate.findUnique({ where: { id: templateId } });
    if (!t || t.companyId !== companyId) throw new NotFoundException('Template not found');

    const latestVersion = await this.prisma.mpPromptTemplateVersion.findFirst({
      where: { templateId }, orderBy: { version: 'desc' },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.mpPromptTemplateVersion.updateMany({ where: { templateId, isActive: true }, data: { isActive: false } }),
      this.prisma.mpPromptTemplateVersion.create({ data: {
        companyId, templateId, version: nextVersion,
        systemPrompt: dto.systemPrompt,
        userTemplate: dto.userTemplate,
        variables: (dto.variables ?? []) as any,
        createdBy: actorId,
        isActive: true,
        isAdvisory: true,
      } }),
    ]);

    await this.audit.record({ companyId, actorId, action: 'MP_PROMPT_TEMPLATE_VERSIONED', objectType: 'MpPromptTemplate', objectId: templateId, newValue: { version: nextVersion } });
    return { id: templateId, version: nextVersion };
  }
}
