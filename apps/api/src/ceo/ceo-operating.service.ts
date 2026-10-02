import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';

@Injectable()
export class CeoOperatingService {
  private readonly logger = new Logger(CeoOperatingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Get the current operating state for the CEO (dashboard data) */
  async getOperatingState(companyId: string) {
    const [objectives, decisions, commands] = await Promise.all([
      this.prisma.companyObjective.findMany({
        where: { companyId, status: { in: ['PROPOSED', 'ACTIVE'] } },
        orderBy: { priority: 'asc' },
      }),
      this.prisma.managementDecision.findMany({
        where: { companyId, status: 'PROPOSED' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.chairmanCommand.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    ]);

    return {
      objectives,
      pendingDecisions: decisions,
      recentCommands: commands,
    };
  }

  /** Set a company objective/priority */
  async createPriority(companyId: string, ceoId: string, data: { title: string, description?: string, priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', targetDate?: Date }) {
    const obj = await this.prisma.companyObjective.create({
      data: {
        companyId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        ownerId: ceoId,
        status: 'ACTIVE',
        targetDate: data.targetDate,
      }
    });
    
    // Notify chairman via realtime
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company) {
      this.realtime.broadcastToUser(company.chairmanId, 'ceo.priority_added', { objectiveId: obj.id, title: obj.title });
    }
    
    return obj;
  }

  /** Foundation for delegation: CEO assigns a task to a department lead */
  async delegateTask(companyId: string, ceoId: string, data: { leadRoleTitle: string, title: string, description: string, objectiveId?: string, priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }) {
    // 1. Identify the lead
    const lead = await this.prisma.employee.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
        role: { title: { contains: data.leadRoleTitle, mode: 'insensitive' } }
      }
    });

    if (!lead) {
      throw new NotFoundException(`No active employee found with role matching: ${data.leadRoleTitle}`);
    }

    // 2. Assign work
    const task = await this.prisma.task.create({
      data: {
        companyId,
        title: data.title,
        description: data.description,
        status: 'READY',
        priority: data.priority || 'NORMAL',
        assignedEmployeeId: lead.id,
        createdBy: ceoId,
        goalId: data.objectiveId,
      }
    });

    this.logger.log(`[${companyId}] CEO delegated task '${task.title}' to ${lead.name} (${data.leadRoleTitle})`);

    // Notify the lead if they are a real user, or for simulation logs
    return task;
  }
}
