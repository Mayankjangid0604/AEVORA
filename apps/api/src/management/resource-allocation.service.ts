import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, ResourceType, AllocationStatus } from '@prisma/client';

@Injectable()
export class ResourceAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async proposeAllocation(companyId: string, actorId: string, dto: {
    resourceType: ResourceType;
    resourceId: string;
    fromContext: unknown;
    toContext: unknown;
    reason: string;
    justification?: string;
    cycleId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!dto.reason || dto.reason.trim().length < 5) throw new BadRequestException('Allocation reason required');

    // Verify resource belongs to company when it's an employee
    if (dto.resourceType === ResourceType.EMPLOYEE || dto.resourceType === ResourceType.AI_WORKER) {
      const emp = await this.prisma.employee.findUnique({ where: { id: dto.resourceId } });
      if (!emp || emp.companyId !== companyId) throw new NotFoundException('Resource not found in company');
    }

    const alloc = await this.prisma.resourceAllocationRecord.create({
      data: {
        companyId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        fromContext: (dto.fromContext ?? {}) as any,
        toContext: (dto.toContext ?? {}) as any,
        reason: dto.reason,
        justification: dto.justification,
        requestedBy: actorId,
        status: AllocationStatus.PROPOSED,
        isAdvisory: true,
        cycleId: dto.cycleId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'RESOURCE_ALLOCATION_PROPOSED', objectType: 'ResourceAllocationRecord', objectId: alloc.id, newValue: { resourceType: dto.resourceType, resourceId: dto.resourceId, reason: dto.reason } });
    return alloc;
  }

  async approveAllocation(companyId: string, actorId: string, allocationId: string, approvalId?: string) {
    await this.verifyActor(actorId, companyId);
    const alloc = await this.prisma.resourceAllocationRecord.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    if (alloc.status !== AllocationStatus.PROPOSED) throw new BadRequestException('Only PROPOSED allocations can be approved');
    if (alloc.requestedBy === actorId) throw new ForbiddenException('Requester cannot self-approve allocation');

    const updated = await this.prisma.resourceAllocationRecord.update({
      where: { id: allocationId },
      data: { status: AllocationStatus.APPROVED, approvedBy: actorId, isAdvisory: false, approvalId },
    });
    await this.audit.record({ companyId, actorId, action: 'RESOURCE_ALLOCATION_APPROVED', objectType: 'ResourceAllocationRecord', objectId: allocationId });
    return updated;
  }

  async rejectAllocation(companyId: string, actorId: string, allocationId: string) {
    await this.verifyActor(actorId, companyId);
    const alloc = await this.prisma.resourceAllocationRecord.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    if (alloc.status !== AllocationStatus.PROPOSED) throw new BadRequestException('Only PROPOSED allocations can be rejected');

    const updated = await this.prisma.resourceAllocationRecord.update({ where: { id: allocationId }, data: { status: AllocationStatus.REJECTED } });
    await this.audit.record({ companyId, actorId, action: 'RESOURCE_ALLOCATION_REJECTED', objectType: 'ResourceAllocationRecord', objectId: allocationId });
    return updated;
  }

  async markExecuted(companyId: string, actorId: string, allocationId: string) {
    await this.verifyActor(actorId, companyId);
    const alloc = await this.prisma.resourceAllocationRecord.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    if (alloc.status !== AllocationStatus.APPROVED) throw new BadRequestException('Only APPROVED allocations can be executed');

    const updated = await this.prisma.resourceAllocationRecord.update({ where: { id: allocationId }, data: { status: AllocationStatus.EXECUTED } });
    await this.audit.record({ companyId, actorId, action: 'RESOURCE_ALLOCATION_EXECUTED', objectType: 'ResourceAllocationRecord', objectId: allocationId });
    return updated;
  }

  async getAllocations(companyId: string, status?: AllocationStatus) {
    return this.prisma.resourceAllocationRecord.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
