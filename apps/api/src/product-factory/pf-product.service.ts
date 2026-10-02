import {
  Injectable, ForbiddenException, NotFoundException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfProductLifecycle, EmployeeStatus } from '@prisma/client';

const LIFECYCLE_TRANSITIONS: Record<PfProductLifecycle, PfProductLifecycle[]> = {
  IDEA:               [PfProductLifecycle.VALIDATING],
  VALIDATING:         [PfProductLifecycle.VALIDATED],
  VALIDATED:          [PfProductLifecycle.PLANNING],
  PLANNING:           [PfProductLifecycle.IN_DEVELOPMENT],
  IN_DEVELOPMENT:     [PfProductLifecycle.TESTING],
  TESTING:            [PfProductLifecycle.SECURITY_REVIEW],
  SECURITY_REVIEW:    [PfProductLifecycle.AWAITING_APPROVAL],
  AWAITING_APPROVAL:  [PfProductLifecycle.APPROVED],
  APPROVED:           [PfProductLifecycle.RELEASED],
  RELEASED:           [PfProductLifecycle.LAUNCHED],
  LAUNCHED:           [PfProductLifecycle.ACTIVE],
  ACTIVE:             [PfProductLifecycle.DEPRECATED],
  DEPRECATED:         [PfProductLifecycle.RETIRED],
  RETIRED:            [],
};

@Injectable()
export class PfProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PfAuditService,
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
    problemStatement?: string;
    targetCustomer?: string;
    category?: string;
    ownerId?: string;
    strategicThemeId?: string;
    strategicInitiativeId?: string;
    researchProjectId?: string;
    labProjectId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const existing = await this.prisma.pfProduct.findFirst({ where: { companyId, name: dto.name } });
    if (existing) throw new ConflictException('Product name already exists');

    const product = await this.prisma.pfProduct.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        problemStatement: dto.problemStatement,
        targetCustomer: dto.targetCustomer,
        category: dto.category,
        ownerId: dto.ownerId ?? actorId,
        registeredBy: actorId,
        strategicThemeId: dto.strategicThemeId,
        strategicInitiativeId: dto.strategicInitiativeId,
        researchProjectId: dto.researchProjectId,
        labProjectId: dto.labProjectId,
        lifecycle: PfProductLifecycle.IDEA,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId: product.id, action: 'PF_PRODUCT_CREATED', objectType: 'PfProduct', objectId: product.id, newValue: { name: product.name } });
    return product;
  }

  async list(companyId: string, lifecycle?: PfProductLifecycle, includeArchived = false) {
    return this.prisma.pfProduct.findMany({
      where: {
        companyId,
        ...(lifecycle ? { lifecycle } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        versions: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { features: true, releases: true } },
      },
    });
  }

  async get(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({
      where: { id: productId },
      include: {
        versions: { orderBy: { createdAt: 'desc' } },
        features: { orderBy: { createdAt: 'desc' } },
        requirements: { orderBy: { createdAt: 'desc' } },
        releases: { orderBy: { createdAt: 'desc' }, take: 5 },
        launches: { orderBy: { createdAt: 'desc' }, take: 3 },
        securityReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
        qaRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        analytics: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return p;
  }

  async advanceLifecycle(companyId: string, actorId: string, productId: string, newLifecycle: PfProductLifecycle) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    if (p.isArchived) throw new BadRequestException('Cannot transition archived product');

    const allowed = LIFECYCLE_TRANSITIONS[p.lifecycle];
    if (!allowed.includes(newLifecycle))
      throw new BadRequestException(`Cannot transition ${p.lifecycle} → ${newLifecycle}`);

    // Self-approval prevention: APPROVED requires a different actor than registeredBy
    if (newLifecycle === PfProductLifecycle.APPROVED && p.registeredBy === actorId)
      throw new ForbiddenException('Registrant cannot self-approve product');

    const updated = await this.prisma.pfProduct.update({
      where: { id: productId },
      data: {
        lifecycle: newLifecycle,
        ...(newLifecycle === PfProductLifecycle.APPROVED ? { approvedBy: actorId, approvedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_LIFECYCLE_ADVANCED', objectType: 'PfProduct', objectId: productId, oldValue: { lifecycle: p.lifecycle }, newValue: { lifecycle: newLifecycle } });
    return updated;
  }

  async update(companyId: string, actorId: string, productId: string, dto: {
    description?: string;
    problemStatement?: string;
    targetCustomer?: string;
    category?: string;
    ownerId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    if (p.lifecycle === PfProductLifecycle.RETIRED) throw new BadRequestException('Retired product cannot be mutated');

    const safeData: Record<string, any> = {};
    if (dto.description !== undefined) safeData.description = dto.description;
    if (dto.problemStatement !== undefined) safeData.problemStatement = dto.problemStatement;
    if (dto.targetCustomer !== undefined) safeData.targetCustomer = dto.targetCustomer;
    if (dto.category !== undefined) safeData.category = dto.category;
    if (dto.ownerId !== undefined) safeData.ownerId = dto.ownerId;
    // ponytail: explicit whitelist; companyId/registeredBy/approvedBy/lifecycle/isAdvisory/isArchived are never allowed here
    const updated = await this.prisma.pfProduct.update({ where: { id: productId }, data: safeData });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_PRODUCT_UPDATED', objectType: 'PfProduct', objectId: productId, newValue: safeData });
    return updated;
  }

  async archive(companyId: string, actorId: string, productId: string) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    if (p.lifecycle === PfProductLifecycle.RETIRED) throw new BadRequestException('Retired product cannot be archived');
    const updated = await this.prisma.pfProduct.update({ where: { id: productId }, data: { isArchived: true } });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_PRODUCT_ARCHIVED', objectType: 'PfProduct', objectId: productId });
    return updated;
  }
}
