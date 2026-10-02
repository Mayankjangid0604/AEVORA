import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaAuditService } from './ca-audit.service';
import { CaAllocationStatus, CaProposalStatus, EmployeeStatus } from '@prisma/client';

// ponytail: env kill switch — swap for DB config if dynamic control needed
const allocationExecutionEnabled = () => process.env.CA_ALLOCATION_EXECUTION === 'enabled';

@Injectable()
export class CaAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CaAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async authorize(companyId: string, actorId: string, proposalId: string, dto: {
    amountMc: number; currency?: string; notes?: string; financeRef?: string;
    idempotencyKey: string;
  }) {
    if (!allocationExecutionEnabled()) throw new ForbiddenException('CA_ALLOCATION_EXECUTION feature is disabled');
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.amountMc)) throw new BadRequestException('amountMc must be an integer');
    const proposal = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.companyId !== companyId) throw new NotFoundException('Proposal not found');
    if (proposal.status !== CaProposalStatus.APPROVED) throw new BadRequestException('Can only authorize APPROVED proposals');
    if (proposal.proposedBy === actorId) throw new ForbiddenException('Self-authorization blocked');
    try {
      const alloc = await this.prisma.caAuthorizedAllocation.create({
        data: {
          companyId, proposalId,
          amountMc: dto.amountMc, currency: dto.currency ?? 'USD',
          notes: dto.notes, financeRef: dto.financeRef,
          authorizedBy: actorId,
          status: CaAllocationStatus.APPROVED,
          idempotencyKey: dto.idempotencyKey,
          isAdvisory: false, // authoritative governance record
        },
      });
      await this.audit.record({ companyId, actorId, poolId: proposal.poolId, action: 'CA_ALLOCATION_AUTHORIZED', objectType: 'CaAuthorizedAllocation', objectId: alloc.id });
      return alloc;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing = await this.prisma.caAuthorizedAllocation.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (!existing || existing.companyId !== companyId) throw new ForbiddenException('Idempotency key collision across tenants');
        return existing;
      }
      throw e;
    }
  }

  async execute(companyId: string, actorId: string, allocationId: string) {
    if (!allocationExecutionEnabled()) throw new ForbiddenException('CA_ALLOCATION_EXECUTION feature is disabled');
    await this.verifyActor(actorId, companyId);
    const alloc = await this.prisma.caAuthorizedAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    if (alloc.status !== CaAllocationStatus.APPROVED) throw new BadRequestException('Can only execute APPROVED allocations');
    // NEVER writes to Finance models
    return this.prisma.caAuthorizedAllocation.update({
      where: { id: allocationId },
      data: { status: CaAllocationStatus.EXECUTING, executedBy: actorId, executedAt: new Date() },
    });
  }

  async complete(companyId: string, actorId: string, allocationId: string) {
    await this.verifyActor(actorId, companyId);
    const alloc = await this.prisma.caAuthorizedAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    if (alloc.status !== CaAllocationStatus.EXECUTING) throw new BadRequestException('Can only complete EXECUTING allocations');
    return this.prisma.caAuthorizedAllocation.update({
      where: { id: allocationId },
      data: { status: CaAllocationStatus.COMPLETE, completedAt: new Date() },
    });
  }

  async list(companyId: string, proposalId?: string) {
    return this.prisma.caAuthorizedAllocation.findMany({
      where: { companyId, ...(proposalId ? { proposalId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, allocationId: string) {
    const alloc = await this.prisma.caAuthorizedAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    return alloc;
  }
}
