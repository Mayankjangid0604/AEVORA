import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationService } from '../simulation/simulation.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';

@Injectable()
export class ChairmanCommandService {
  private readonly logger = new Logger(ChairmanCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly simulationService: SimulationService,
    @Inject(forwardRef(() => CeoAutonomousService)) private readonly ceoAutonomous: CeoAutonomousService,
  ) {}

  async submitCommand(companyId: string, chairmanId: string, text: string) {
    let targetEntity = 'SYSTEM';
    let requestedAction = 'UNKNOWN';
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let requiresApproval = false;

    const lower = text.toLowerCase();
    if (lower.includes('pause')) {
      targetEntity = 'SYSTEM';
      requestedAction = 'PAUSE_COMPANY';
      riskLevel = 'HIGH';
      requiresApproval = true;
    } else if (lower.includes('resume')) {
      targetEntity = 'SYSTEM';
      requestedAction = 'RESUME_COMPANY';
      riskLevel = 'MEDIUM';
    } else if (lower.includes('revenue') || lower.includes('report') || lower.includes('show me')) {
      targetEntity = 'SYSTEM';
      requestedAction = 'VIEW_REPORT';
      riskLevel = 'LOW';
    } else if (lower.includes('ceo')) {
      targetEntity = 'CEO';
      requestedAction = 'ASK_CEO';
      riskLevel = 'LOW';
    } else if (lower.includes('sales')) {
      targetEntity = 'SALES';
      requestedAction = 'UPDATE_SALES';
      riskLevel = 'MEDIUM';
    } else if (lower.includes('terminate') || lower.includes('spend') || lower.includes('delete')) {
      targetEntity = 'SYSTEM';
      requestedAction = 'DANGEROUS_ACTION';
      riskLevel = 'HIGH';
      requiresApproval = true;
    }

    const command = await this.prisma.chairmanCommand.create({
      data: {
        companyId,
        chairmanId,
        naturalLanguage: text,
        parsedIntent: requestedAction,
        targetEntity,
        requestedAction,
        riskLevel,
        requiresApproval,
        status: requiresApproval ? 'AWAITING_APPROVAL' : 'EXECUTING',
      },
    });

    if (!requiresApproval) {
      await this.executeCommand(command.id);
    }

    return command;
  }

  async approveCommand(commandId: string, chairmanId: string) {
    const command = await this.prisma.chairmanCommand.findUnique({ where: { id: commandId } });
    if (!command || command.chairmanId !== chairmanId || command.status !== 'AWAITING_APPROVAL') return null;

    if (command.requestedAction === 'DANGEROUS_ACTION') {
       // We reject dangerous actions even if approved manually to protect the system.
       return this.prisma.chairmanCommand.update({ where: { id: commandId }, data: { status: 'FAILED', executionNotes: 'Action too dangerous to execute.' } });
    }

    await this.prisma.chairmanCommand.update({ where: { id: commandId }, data: { status: 'EXECUTING' } });
    return this.executeCommand(commandId);
  }

  async rejectCommand(commandId: string, chairmanId: string) {
    const command = await this.prisma.chairmanCommand.findUnique({ where: { id: commandId } });
    if (!command || command.chairmanId !== chairmanId || command.status !== 'AWAITING_APPROVAL') return null;

    return this.prisma.chairmanCommand.update({ where: { id: commandId }, data: { status: 'REJECTED' } });
  }

  async executeCommand(commandId: string) {
    const command = await this.prisma.chairmanCommand.findUnique({ where: { id: commandId } });
    if (!command) return;

    try {
      let executionNotes = null;

      if (command.requestedAction === 'PAUSE_COMPANY') {
         await this.simulationService.pause(command.companyId);
         executionNotes = 'Company paused.';
      } else if (command.requestedAction === 'RESUME_COMPANY') {
         await this.simulationService.resume(command.companyId);
         executionNotes = 'Company resumed.';
      } else if (command.requestedAction === 'ASK_CEO') {
         // Create a high priority task for the CEO
         const ceo = await this.prisma.employee.findFirst({
            where: { companyId: command.companyId, role: { accessLevel: 'MANAGEMENT' }, status: 'ACTIVE' }
         });
         if (ceo) {
            let projectId;
            const projectMatch = command.naturalLanguage.match(/project ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
            if (projectMatch) {
               projectId = projectMatch[1];
            } else {
               // Fallback: get an active project
               const p = await this.prisma.project.findFirst({ where: { companyId: command.companyId, status: 'ACTIVE' } });
               if (p) projectId = p.id;
            }

            await this.ceoAutonomous.receiveObjective(
               command.companyId,
               'Chairman Request: ' + command.naturalLanguage.substring(0, 30),
               command.naturalLanguage,
               ceo.id,
               projectId
            );
            executionNotes = 'Request sent to CEO.';
         } else {
            executionNotes = 'No active CEO found.';
         }
      } else if (command.requestedAction === 'DANGEROUS_ACTION') {
         executionNotes = 'Action rejected by system constraints.';
         return await this.prisma.chairmanCommand.update({
            where: { id: commandId },
            data: { status: 'FAILED', executionNotes }
         });
      } else if (command.requestedAction === 'UNKNOWN') {
         executionNotes = 'Command not understood.';
      } else {
         executionNotes = 'Command executed successfully.';
      }
      
      return await this.prisma.chairmanCommand.update({
        where: { id: commandId },
        data: { status: 'COMPLETED', executionNotes }
      });
    } catch (e: any) {
      this.logger.error(`Command failed: ${e.message}`);
      return await this.prisma.chairmanCommand.update({
        where: { id: commandId },
        data: { status: 'FAILED', executionNotes: e.message }
      });
    }
  }


  /** V key in the office: interrupt every active agent's current work and hand them a new URGENT task. */
  async broadcastCommand(companyId: string, text: string) {
    const agents = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE', agent: { status: 'ACTIVE' } },
      select: { id: true },
    });
    const ids = agents.map((a) => a.id);
    if (ids.length === 0) return { broadcastTo: 0 };

    await this.prisma.task.updateMany({
      where: { companyId, assignedEmployeeId: { in: ids }, status: 'IN_PROGRESS' },
      data: { status: 'BLOCKED' },
    });
    await this.prisma.task.createMany({
      data: ids.map((id) => ({
        companyId,
        assignedEmployeeId: id,
        createdBy: 'CHAIRMAN_BROADCAST',
        title: 'Chairman broadcast',
        description: text,
        priority: 'URGENT' as const,
        status: 'READY' as const,
      })),
    });
    return { broadcastTo: ids.length };
  }

  async getCommands(companyId: string, filters?: { status?: string; riskLevel?: string; since?: Date; limit?: number }) {
    const where: any = { companyId };
    if (filters?.status) where.status = filters.status;
    if (filters?.riskLevel) where.riskLevel = filters.riskLevel;
    if (filters?.since) where.createdAt = { gte: filters.since };
    return this.prisma.chairmanCommand.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 50,
    });
  }
}
