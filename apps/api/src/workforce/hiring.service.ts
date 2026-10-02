import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import {
  WorkerType, HiringRequestStatus, EmployeeStatus, ExecutionEnvironment,
} from '@prisma/client';
import { bandSalaryAC } from '../config/salary-bands';

const HIRING_TRANSITIONS: Record<HiringRequestStatus, HiringRequestStatus[]> = {
  WORKFORCE_NEED: [HiringRequestStatus.CANDIDATE, HiringRequestStatus.REJECTED, HiringRequestStatus.WITHDRAWN],
  CANDIDATE: [HiringRequestStatus.REVIEW, HiringRequestStatus.REJECTED, HiringRequestStatus.WITHDRAWN],
  REVIEW: [HiringRequestStatus.APPROVED, HiringRequestStatus.REJECTED, HiringRequestStatus.WITHDRAWN],
  APPROVED: [HiringRequestStatus.OFFER, HiringRequestStatus.WITHDRAWN],
  OFFER: [HiringRequestStatus.ONBOARDING, HiringRequestStatus.WITHDRAWN],
  ONBOARDING: [HiringRequestStatus.ACTIVE, HiringRequestStatus.WITHDRAWN],
  ACTIVE: [],
  REJECTED: [],
  WITHDRAWN: [],
};

@Injectable()
export class HiringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
    private readonly profileSvc: WorkerProfileService,
    private readonly approvalSvc: ApprovalValidationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createHiringRequest(companyId: string, actorId: string, dto: {
    workerType: WorkerType; title: string; description?: string;
    requiredSkills?: unknown[]; compensationBand?: string;
    departmentId?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.companyId !== companyId) throw new NotFoundException('Department not found');
    }

    const req = await this.prisma.hiringRequest.create({
      data: {
        companyId, workerType: dto.workerType, title: dto.title,
        description: dto.description, departmentId: dto.departmentId,
        requiredSkills: (dto.requiredSkills ?? []) as any,
        compensationBand: dto.compensationBand,
        requestedById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'HIRING_REQUEST_CREATED',
      objectType: 'HiringRequest', objectId: req.id,
      newValue: { title: dto.title, workerType: dto.workerType },
    });
    return req;
  }

  async advanceHiringStatus(
    companyId: string, actorId: string, requestId: string,
    newStatus: HiringRequestStatus, opts?: {
      approvalId?: string; candidateName?: string; candidateRef?: string;
      offerDetails?: unknown; notes?: string;
    },
  ) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.hiringRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Hiring request not found');

    const allowed = HIRING_TRANSITIONS[req.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition hiring request from ${req.status} to ${newStatus}`);
    }

    // Approval required for APPROVED status
    if (newStatus === HiringRequestStatus.APPROVED) {
      if (!opts?.approvalId) throw new BadRequestException('approvalId required to approve hiring request');
      await this.approvalSvc.validateAndConsumeApproval(opts.approvalId, {
        companyId, action: 'APPROVE_HIRING',
        environment: ExecutionEnvironment.PRODUCTION,
        targetType: 'HiringRequest', targetId: requestId,
        params: { requestId, workerType: req.workerType, title: req.title },
      });
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      ...(opts?.candidateName ? { candidateName: opts.candidateName } : {}),
      ...(opts?.candidateRef ? { candidateRef: opts.candidateRef } : {}),
      ...(opts?.offerDetails ? { offerDetails: opts.offerDetails as any } : {}),
      ...(opts?.notes ? { notes: opts.notes } : {}),
      ...(newStatus === HiringRequestStatus.APPROVED ? {
        approvalId: opts?.approvalId, approvedById: actorId, approvedAt: new Date(),
      } : {}),
    };

    const updated = await this.prisma.hiringRequest.update({
      where: { id: requestId },
      data: updateData as any,
    });
    await this.audit.record({
      companyId, actorId, action: 'HIRING_STATUS_CHANGED',
      objectType: 'HiringRequest', objectId: requestId,
      oldValue: { status: req.status }, newValue: { status: newStatus },
    });
    return updated;
  }

  async completeHiring(
    companyId: string, actorId: string, requestId: string,
    dto: {
      name: string; identitySeed: string; departmentId: string;
      roleId: string; salary: number;
      skills?: { name: string; category: string; proficiency: number }[];
    },
  ) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.hiringRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Hiring request not found');
    if (req.status !== HiringRequestStatus.ONBOARDING) throw new BadRequestException('Hiring request must be in ONBOARDING status');

    if (!Number.isInteger(dto.salary) || dto.salary < 0) throw new BadRequestException('salary must be non-negative integer');

    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept || dept.companyId !== companyId) throw new NotFoundException('Department not found');

    const employee = await this.prisma.$transaction(async (tx) => {
      // Re-check status inside transaction to prevent concurrent duplicate hiring (MEDIUM-F03 fix)
      const locked = await tx.hiringRequest.findUnique({ where: { id: requestId } });
      if (!locked || locked.status !== HiringRequestStatus.ONBOARDING) {
        throw new BadRequestException('Hiring request is no longer in ONBOARDING status (concurrent completion detected)');
      }

      const salary = dto.salary > 0 ? dto.salary : bandSalaryAC(await tx.role.findUnique({ where: { id: dto.roleId } }));
      const emp = await tx.employee.create({
        data: {
          name: dto.name, identitySeed: dto.identitySeed,
          companyId, departmentId: dto.departmentId, roleId: dto.roleId,
          salary, status: EmployeeStatus.ACTIVE,
          skills: { create: (dto.skills ?? []).map(s => ({ name: s.name, category: s.category, proficiency: Math.max(0, Math.min(100, s.proficiency)) })) },
          history: { create: [{ eventType: 'HIRED', newValue: 'ACTIVE', actor: actorId }] },
        },
      });
      await tx.aCWallet.create({ data: { employeeId: emp.id, balance: 0 } });
      await tx.workerProfile.create({
        data: { employeeId: emp.id, workerType: req.workerType, companyId },
      });
      // Conditional update: only proceed if still ONBOARDING — prevents double-completion race
      const consumed = await tx.hiringRequest.updateMany({
        where: { id: requestId, status: HiringRequestStatus.ONBOARDING },
        data: { status: HiringRequestStatus.ACTIVE, resultEmployeeId: emp.id },
      });
      if (consumed.count === 0) throw new BadRequestException('Conflict: hiring request already completed');
      await tx.companyEvent.create({ data: { companyId, type: 'EMPLOYEE_HIRED', payload: { employeeId: emp.id, name: emp.name } as any } });
      return emp;
    });

    await this.audit.record({
      companyId, actorId, action: 'HIRING_COMPLETED',
      objectType: 'HiringRequest', objectId: requestId,
      newValue: { employeeId: employee.id, name: dto.name, workerType: req.workerType },
    });
    return employee;
  }

  async getHiringRequests(companyId: string, status?: HiringRequestStatus, workerType?: WorkerType) {
    return this.prisma.hiringRequest.findMany({
      where: { companyId, ...(status ? { status } : {}), ...(workerType ? { workerType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getHiringRequest(companyId: string, requestId: string) {
    const req = await this.prisma.hiringRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Hiring request not found');
    return req;
  }
}
