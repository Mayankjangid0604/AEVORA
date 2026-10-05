import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerType, AutonomyLevel, EmployeeStatus } from '@prisma/client';

@Injectable()
export class WorkerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async ensureProfile(employeeId: string, companyId: string, workerType: WorkerType = WorkerType.HUMAN) {
    const existing = await this.prisma.workerProfile.findUnique({ where: { employeeId } });
    if (existing) return existing;

    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.companyId !== companyId) throw new NotFoundException('Employee not found');

    return this.prisma.workerProfile.create({
      data: { employeeId, workerType, companyId },
    });
  }

  async getProfile(companyId: string, employeeId: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { employeeId },
      include: { employee: { include: { role: true, department: true } }, skillVerifications: true },
    });
    if (!profile || profile.companyId !== companyId) throw new NotFoundException('Worker profile not found');
    return profile;
  }

  async listProfiles(companyId: string, workerType?: WorkerType) {
    return this.prisma.workerProfile.findMany({
      where: { companyId, ...(workerType ? { workerType } : {}) },
      include: { employee: { select: { name: true, status: true, salary: true, performance: true, reliability: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setManager(companyId: string, actorId: string, employeeId: string, managerId: string | null) {
    await this.verifyActor(actorId, companyId);
    const profile = await this.ensureProfile(employeeId, companyId);

    if (managerId !== null) {
      // Prevent self-management
      if (employeeId === managerId) throw new BadRequestException('An employee cannot manage themselves');

      const managerProfile = await this.prisma.workerProfile.findUnique({ where: { employeeId: managerId } });
      if (!managerProfile || managerProfile.companyId !== companyId) throw new NotFoundException('Manager not found in company');

      // Prevent circular hierarchy: walk up the manager chain
      await this.checkNoCycle(profile.id, managerProfile.id);
    }

    const updated = await this.prisma.workerProfile.update({
      where: { id: profile.id },
      data: { managerId: managerId ? (await this.prisma.workerProfile.findUnique({ where: { employeeId: managerId } }))!.id : null },
    });

    await this.audit.record({
      companyId, actorId, action: 'MANAGER_SET',
      objectType: 'WorkerProfile', objectId: profile.id,
      oldValue: { managerId: profile.managerId },
      newValue: { managerId: updated.managerId },
    });
    return updated;
  }

  private async checkNoCycle(profileId: string, newManagerId: string) {
    // Walk the manager chain from newManagerId up — if we reach profileId, it's circular
    let current: string | null = newManagerId;
    const visited = new Set<string>();
    while (current) {
      if (current === profileId) throw new BadRequestException('Circular management hierarchy detected');
      if (visited.has(current)) break; // already visited, no more chain
      visited.add(current);
      const p = await this.prisma.workerProfile.findUnique({ where: { id: current } });
      current = p?.managerId ?? null;
    }
  }

  async updateAutonomy(companyId: string, actorId: string, employeeId: string, autonomyLevel: AutonomyLevel) {
    await this.verifyActor(actorId, companyId);
    const profile = await this.ensureProfile(employeeId, companyId);

    // High autonomy requires Chairman approval — enforce that this call only comes from authorized path
    if (autonomyLevel === AutonomyLevel.HIGH_AUTONOMY || autonomyLevel === AutonomyLevel.AUTONOMOUS) {
      throw new BadRequestException('AUTONOMOUS/HIGH_AUTONOMY requires Chairman approval — use AIProvisioningRequest with approval');
    }

    const updated = await this.prisma.workerProfile.update({
      where: { id: profile.id },
      data: { autonomyLevel },
    });
    await this.audit.record({
      companyId, actorId, action: 'AUTONOMY_UPDATED',
      objectType: 'WorkerProfile', objectId: profile.id,
      oldValue: { autonomyLevel: profile.autonomyLevel },
      newValue: { autonomyLevel },
    });
    return updated;
  }

  async getDirectReports(companyId: string, actorId: string) {
    const profile = await this.prisma.workerProfile.findUnique({ where: { employeeId: actorId } });
    if (!profile || profile.companyId !== companyId) return [];
    return this.prisma.workerProfile.findMany({
      where: { managerId: profile.id, companyId },
      include: { employee: { select: { name: true, status: true } } },
    });
  }

  async getAnalytics(companyId: string) {
    const [total, byType, active, aiWorkers] = await Promise.all([
      this.prisma.workerProfile.count({ where: { companyId } }),
      this.prisma.workerProfile.groupBy({ by: ['workerType'], where: { companyId }, _count: true }),
      this.prisma.employee.count({ where: { companyId, status: EmployeeStatus.ACTIVE } }),
      this.prisma.workerProfile.count({ where: { companyId, workerType: { in: [WorkerType.AI, WorkerType.AI_AGENT, WorkerType.AI_MANAGER, WorkerType.AI_EXECUTIVE] } } }),
    ]);
    return { total, byType, activeEmployees: active, aiWorkers };
  }
}
