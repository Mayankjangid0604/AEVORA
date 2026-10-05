import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import {
  WorkerType, AIProvisioningStatus, AutonomyLevel, EmployeeStatus, ExecutionEnvironment,
} from '@prisma/client';
import { bandSalaryAC } from '../config/salary-bands';

// AI workers MUST NOT directly do any of these
const FORBIDDEN_AI_WORKFORCE_ACTIONS = [
  'MODIFY_GOVERNANCE', 'GRANT_PERMISSIONS', 'IMPERSONATE_CHAIRMAN',
  'CREATE_UNRESTRICTED_AI', 'APPROVE_OWN_PROMOTION', 'APPROVE_OWN_COMPENSATION',
  'TERMINATE_CHAIRMAN', 'ALTER_CONSTITUTIONAL_POLICY', 'DISABLE_AUDIT_LOGGING',
  'DISABLE_WORKFORCE_SAFETY', 'BYPASS_APPROVAL', 'GRANT_FINANCIAL_AUTHORITY',
  'SELF_REPLICATE', 'SELF_PROMOTE', 'SELF_BONUS',
] as const;

// AI workers with AUTONOMOUS/HIGH_AUTONOMY require Chairman approval
const HIGH_RISK_AUTONOMY_LEVELS: AutonomyLevel[] = [AutonomyLevel.AUTONOMOUS, AutonomyLevel.HIGH_AUTONOMY];

@Injectable()
export class AIWorkforceService {
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

  getForbiddenActions(): readonly string[] {
    return FORBIDDEN_AI_WORKFORCE_ACTIONS;
  }

  async requestProvisioning(companyId: string, actorId: string, dto: {
    workerType: WorkerType; proposedName: string; proposedRole: string;
    proposedDept?: string; aiModel: string; aiProvider: string; aiSystemRole: string;
    aiCapabilities?: string[]; aiTools?: string[];
    autonomyLevel?: AutonomyLevel; budgetLimit?: number;
    managerId?: string; idempotencyKey?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    const AI_TYPES: WorkerType[] = [WorkerType.AI, WorkerType.AI_AGENT, WorkerType.AI_MANAGER, WorkerType.AI_EXECUTIVE];
    if (!AI_TYPES.includes(dto.workerType)) {
      throw new BadRequestException('Worker type must be AI, AI_AGENT, AI_MANAGER, or AI_EXECUTIVE');
    }

    // Idempotency: check if same key already processed
    if (dto.idempotencyKey) {
      const existing = await this.prisma.aIProvisioningRequest.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) {
        if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to another company');
        return existing;
      }
    }

    // HIGH_AUTONOMY requires explicit Chairman approval path
    const autonomyLevel = dto.autonomyLevel ?? AutonomyLevel.MANUAL;
    if (HIGH_RISK_AUTONOMY_LEVELS.includes(autonomyLevel)) {
      throw new BadRequestException('AUTONOMOUS/HIGH_AUTONOMY provisioning requires the Chairman approval path — submit as MANUAL and escalate');
    }

    // Validate managerId cross-company
    if (dto.managerId) {
      const managerProfile = await this.prisma.workerProfile.findUnique({ where: { employeeId: dto.managerId } });
      if (!managerProfile || managerProfile.companyId !== companyId) throw new NotFoundException('Manager not found in company');
    }

    const req = await this.prisma.aIProvisioningRequest.create({
      data: {
        companyId, requestedById: actorId,
        workerType: dto.workerType, proposedName: dto.proposedName,
        proposedRole: dto.proposedRole, proposedDept: dto.proposedDept,
        aiModel: dto.aiModel, aiProvider: dto.aiProvider, aiSystemRole: dto.aiSystemRole,
        aiCapabilities: (dto.aiCapabilities ?? []) as any,
        aiTools: (dto.aiTools ?? []) as any,
        autonomyLevel, budgetLimit: dto.budgetLimit,
        managerId: dto.managerId, idempotencyKey: dto.idempotencyKey,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'AI_PROVISIONING_REQUESTED',
      objectType: 'AIProvisioningRequest', objectId: req.id,
      newValue: { workerType: dto.workerType, proposedName: dto.proposedName, autonomyLevel },
    });
    return req;
  }

  async approveProvisioning(companyId: string, actorId: string, requestId: string, approvalId: string) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.aIProvisioningRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('AI provisioning request not found');
    if (req.status !== AIProvisioningStatus.PROPOSAL) throw new BadRequestException('Request must be in PROPOSAL status');

    await this.approvalSvc.validateAndConsumeApproval(approvalId, {
      companyId, action: 'APPROVE_AI_PROVISIONING',
      environment: ExecutionEnvironment.PRODUCTION,
      targetType: 'AIProvisioningRequest', targetId: requestId,
      params: { requestId, workerType: req.workerType, proposedName: req.proposedName, autonomyLevel: req.autonomyLevel },
    });

    const updated = await this.prisma.aIProvisioningRequest.update({
      where: { id: requestId },
      data: { status: AIProvisioningStatus.APPROVED, approvalId, approvedById: actorId, approvedAt: new Date() },
    });
    await this.audit.record({
      companyId, actorId, action: 'AI_PROVISIONING_APPROVED',
      objectType: 'AIProvisioningRequest', objectId: requestId,
      oldValue: { status: 'PROPOSAL' }, newValue: { status: 'APPROVED' },
    });
    return updated;
  }

  async executeProvisioning(companyId: string, actorId: string, requestId: string, opts: { departmentId: string; roleId: string }) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.aIProvisioningRequest.findUnique({ where: { id: requestId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('AI provisioning request not found');
    if (req.status !== AIProvisioningStatus.APPROVED) throw new BadRequestException('Request must be APPROVED before execution');

    const dept = await this.prisma.department.findUnique({ where: { id: opts.departmentId } });
    if (!dept || dept.companyId !== companyId) throw new NotFoundException('Department not found');

    const employee = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: opts.roleId }, select: { title: true, level: true, accessLevel: true } });
      const emp = await tx.employee.create({
        data: {
          name: req.proposedName, identitySeed: `AI-${req.id}`,
          companyId, departmentId: opts.departmentId, roleId: opts.roleId,
          salary: bandSalaryAC(role), status: EmployeeStatus.ACTIVE,
          history: { create: [{ eventType: 'AI_PROVISIONED', newValue: 'ACTIVE', actor: actorId }] },
        },
      });
      await tx.aCWallet.create({ data: { employeeId: emp.id, balance: 0 } });
      await tx.agent.create({
        data: {
          employeeId: emp.id, status: 'ACTIVE', autonomyLevel: req.autonomyLevel,
          configuration: {
            model: req.aiModel, provider: req.aiProvider,
            systemRole: req.aiSystemRole, provisioningRequestId: req.id,
          } as any,
        },
      });
      await tx.workerProfile.create({
        data: {
          employeeId: emp.id, workerType: req.workerType,
          companyId, autonomyLevel: req.autonomyLevel,
          aiModel: req.aiModel, aiProvider: req.aiProvider, aiSystemRole: req.aiSystemRole,
          aiCapabilities: req.aiCapabilities as any, aiTools: req.aiTools as any,
          aiBudgetLimit: req.budgetLimit,
        },
      });
      await tx.aIProvisioningRequest.update({
        where: { id: requestId },
        data: { status: AIProvisioningStatus.ACTIVE, resultEmployeeId: emp.id },
      });
      return emp;
    });

    await this.audit.record({
      companyId, actorId, action: 'AI_WORKER_PROVISIONED',
      objectType: 'AIProvisioningRequest', objectId: requestId,
      newValue: { employeeId: employee.id, workerType: req.workerType, autonomyLevel: req.autonomyLevel },
    });
    return employee;
  }

  async deactivateAIWorker(companyId: string, actorId: string, employeeId: string, reason: string) {
    await this.verifyActor(actorId, companyId);
    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target || target.companyId !== companyId) throw new NotFoundException('Employee not found');

    const profile = await this.prisma.workerProfile.findUnique({ where: { employeeId } });
    if (!profile || !([WorkerType.AI, WorkerType.AI_AGENT, WorkerType.AI_MANAGER, WorkerType.AI_EXECUTIVE] as WorkerType[]).includes(profile.workerType)) {
      throw new BadRequestException('Employee is not an AI worker');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employeeId }, data: { status: EmployeeStatus.TERMINATED, terminationDate: new Date() } });
      const agent = await tx.agent.findUnique({ where: { employeeId } });
      if (agent) await tx.agent.update({ where: { employeeId }, data: { status: 'DISABLED' } });
      await tx.workerProfile.update({ where: { employeeId }, data: { offboardedAt: new Date() } });
      await tx.employmentHistory.create({
        data: { employeeId, eventType: 'AI_DEACTIVATED', newValue: 'TERMINATED', actor: actorId, reason },
      });
    });

    await this.audit.record({
      companyId, actorId, action: 'AI_WORKER_DEACTIVATED',
      objectType: 'Employee', objectId: employeeId,
      newValue: { status: 'TERMINATED', reason },
    });
  }

  async getAIWorkers(companyId: string, workerType?: WorkerType) {
    const types = workerType
      ? [workerType]
      : [WorkerType.AI, WorkerType.AI_AGENT, WorkerType.AI_MANAGER, WorkerType.AI_EXECUTIVE];
    return this.prisma.workerProfile.findMany({
      where: { companyId, workerType: { in: types } },
      include: { employee: { select: { name: true, status: true, agent: true } } },
    });
  }

  async getProvisioningRequests(companyId: string, status?: AIProvisioningStatus) {
    return this.prisma.aIProvisioningRequest.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
