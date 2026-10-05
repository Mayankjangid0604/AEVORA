import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { BuCapitalRequestStatus, EmployeeStatus } from '@prisma/client';

// ponytail: feature kill switch — env-based, swap for DB config if dynamic control needed
const killSwitchEnabled = () => process.env.BU_CAPITAL_REQUEST_APPROVAL !== 'enabled';

@Injectable()
export class BuCapitalRequestService {
  constructor(private readonly prisma: PrismaService, private readonly audit: BuAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, buId: string, dto: {
    title: string; description?: string; amountMc: number; currency?: string;
    justification?: string; expectedReturn?: string; idempotencyKey: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.amountMc)) throw new BadRequestException('amountMc must be an integer');
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    if (bu.lifecycle === 'RETIRED') throw new BadRequestException('Cannot create capital request for a retired BU');
    try {
      const req = await this.prisma.buCapitalRequest.create({
        data: {
          companyId, buId, title: dto.title, description: dto.description,
          amountMc: dto.amountMc, currency: dto.currency ?? 'USD',
          justification: dto.justification, expectedReturn: dto.expectedReturn,
          requestedBy: actorId, idempotencyKey: dto.idempotencyKey, isAdvisory: true,
        },
      });
      await this.audit.record({ companyId, actorId, buId, action: 'BU_CAPITAL_REQUEST_CREATED', objectType: 'BuCapitalRequest', objectId: req.id });
      return req;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return this.prisma.buCapitalRequest.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      }
      throw e;
    }
  }

  async list(companyId: string, buId: string, status?: BuCapitalRequestStatus) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    return this.prisma.buCapitalRequest.findMany({ where: { companyId, buId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' } });
  }

  async get(companyId: string, requestId: string) {
    const req = await this.prisma.buCapitalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Capital request not found');
    return req;
  }

  async submit(companyId: string, actorId: string, requestId: string) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.buCapitalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Capital request not found');
    if (req.status !== BuCapitalRequestStatus.DRAFT) throw new BadRequestException('Can only submit DRAFT requests');
    return this.prisma.buCapitalRequest.update({ where: { id: requestId }, data: { status: BuCapitalRequestStatus.SUBMITTED } });
  }

  async review(companyId: string, actorId: string, requestId: string) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.buCapitalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Capital request not found');
    if (req.status !== BuCapitalRequestStatus.SUBMITTED) throw new BadRequestException('Can only review SUBMITTED requests');
    return this.prisma.buCapitalRequest.update({ where: { id: requestId }, data: { status: BuCapitalRequestStatus.UNDER_REVIEW, reviewedBy: actorId } });
  }

  async approve(companyId: string, actorId: string, requestId: string) {
    if (killSwitchEnabled()) throw new ForbiddenException('BU_CAPITAL_REQUEST_APPROVAL feature is disabled');
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.buCapitalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Capital request not found');
    if (req.requestedBy === actorId) throw new ForbiddenException('Self-approval blocked');
    if (req.status !== BuCapitalRequestStatus.UNDER_REVIEW) throw new BadRequestException('Can only approve UNDER_REVIEW requests');
    return this.prisma.buCapitalRequest.update({ where: { id: requestId }, data: { status: BuCapitalRequestStatus.APPROVED, approvedBy: actorId, approvedAt: new Date() } });
  }

  async reject(companyId: string, actorId: string, requestId: string, reason: string) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.buCapitalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Capital request not found');
    return this.prisma.buCapitalRequest.update({ where: { id: requestId }, data: { status: BuCapitalRequestStatus.REJECTED, rejectedBy: actorId, rejectionReason: reason } });
  }

  async withdraw(companyId: string, actorId: string, requestId: string) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.buCapitalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Capital request not found');
    if (req.requestedBy !== actorId) throw new ForbiddenException('Only the requester can withdraw');
    return this.prisma.buCapitalRequest.update({ where: { id: requestId }, data: { status: BuCapitalRequestStatus.WITHDRAWN } });
  }
}
