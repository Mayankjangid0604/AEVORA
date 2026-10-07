import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
  Logger, Optional, Inject, forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { HqCapacityService } from '../v12-spatial/hq-capacity.service';
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
  private readonly logger = new Logger(HiringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
    private readonly profileSvc: WorkerProfileService,
    private readonly approvalSvc: ApprovalValidationService,
    @Optional() @Inject(forwardRef(() => HqCapacityService))
    private readonly hqCapacityService?: HqCapacityService,
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

  /**
   * V15-C Authoritative Automatic Workforce Provisioning.
   * Routes workforce demand through real authoritative business pipeline:
   * Actor Validation -> Department Validation -> Role Resolution -> HiringRequest
   * -> completeHiring (Employee + ACWallet + WorkerProfile + EMPLOYEE_HIRED event)
   * -> V15-B Spatial Capacity Reconciliation (with failure isolation).
   */
  async autoProvisionDepartmentWorkforce(
    companyId: string,
    actorId: string,
    dto: {
      departmentId: string;
      count: number;
      roleId?: string;
      workerType?: WorkerType;
      titlePrefix?: string;
      compensationBand?: string;
    },
  ) {
    await this.verifyActor(actorId, companyId);

    if (!Number.isInteger(dto.count) || dto.count <= 0 || dto.count > 50) {
      throw new BadRequestException('Count must be an integer between 1 and 50');
    }

    const dept = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!dept || dept.companyId !== companyId) {
      throw new NotFoundException('Department not found or does not belong to company');
    }

    // Resolve or find suitable role
    let role: any = null;
    if (dto.roleId) {
      role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role || (role.companyId && role.companyId !== companyId)) {
        throw new NotFoundException('Specified role not found or does not belong to company');
      }
    } else {
      role = await this.prisma.role.findFirst({
        where: {
          OR: [{ companyId }, { companyId: null }],
        },
      });
    }

    if (!role) {
      // Create a default role for this company if none exists
      role = await this.prisma.role.create({
        data: {
          title: `${dept.name} Specialist`,
          companyId,
          level: 3,
          accessLevel: 'STANDARD',
        },
      });
    }

    const workerType = dto.workerType || WorkerType.HUMAN;
    const provisionedEmployees: any[] = [];

    for (let i = 1; i <= dto.count; i++) {
      const candidateTitle = dto.titlePrefix
        ? `${dto.titlePrefix} ${i}`
        : `${dept.name} Specialist ${i}`;

      // 1. Authoritative HiringRequest in ONBOARDING state for direct enterprise execution
      const hiringReq = await this.prisma.hiringRequest.create({
        data: {
          companyId,
          departmentId: dept.id,
          workerType,
          title: candidateTitle,
          description: `Authoritative auto-provisioned workforce requirement for ${dept.name}`,
          compensationBand: dto.compensationBand || 'L3',
          requestedById: actorId,
          status: HiringRequestStatus.ONBOARDING,
          candidateName: candidateTitle,
          approvedById: actorId,
          approvedAt: new Date(),
        },
      });

      await this.audit.record({
        companyId,
        actorId,
        action: 'AUTO_PROVISION_REQUEST_CREATED',
        objectType: 'HiringRequest',
        objectId: hiringReq.id,
        newValue: { departmentId: dept.id, workerType, count: dto.count },
      });

      // 2. Authoritative employee creation through completeHiring
      const emp = await this.completeHiring(companyId, actorId, hiringReq.id, {
        name: `${candidateTitle} ${Date.now().toString().slice(-4)}${i}`,
        identitySeed: `AUTO-${companyId.slice(0, 4)}-${dept.id.slice(0, 4)}-${i}-${Date.now()}`,
        departmentId: dept.id,
        roleId: role.id,
        salary: bandSalaryAC(role),
        skills: [
          { name: 'Core Operations', category: 'General', proficiency: 75 },
          { name: dept.name, category: 'Domain', proficiency: 80 },
        ],
      });

      provisionedEmployees.push(emp);
    }

    // 3. Trigger spatial capacity reconciliation (V15-B integration) with failure isolation
    if (this.hqCapacityService) {
      try {
        await this.hqCapacityService.reconcileCompanyCapacity(companyId);
      } catch (spatialErr: any) {
        // Critical V15-C failure isolation invariant:
        // Spatial reconciliation failure must NEVER rollback or fail the authoritative employee transaction
        this.logger.warn(
          `[V15-C Failure Isolation] Spatial capacity reconciliation failed after provisioning ${provisionedEmployees.length} employees for department ${dept.id}: ${spatialErr?.message}`,
        );
      }
    }

    return {
      success: true,
      provisionedCount: provisionedEmployees.length,
      departmentId: dept.id,
      departmentName: dept.name,
      roleId: role.id,
      roleTitle: role.title,
      employees: provisionedEmployees.map((e) => ({
        id: e.id,
        name: e.name,
        departmentId: e.departmentId,
        roleId: e.roleId,
        status: e.status,
      })),
    };
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
