import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationService } from '../simulation/simulation.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';

@Injectable()
export class ChairmanCommandService {
  private readonly logger = new Logger(ChairmanCommandService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly simulationService: SimulationService,
    @Inject(forwardRef(() => CeoAutonomousService)) private readonly ceoAutonomous: CeoAutonomousService,
  ) {}

  async submitCommand(companyId: string, chairmanId: string, text: string) {
    const prompt = `
You are the Chairman Assistant NLP router.
Analyze the following request from the Chairman.
Distinguish between information requests, actions, and approvals.
Do not reinterpret actions as approvals. Do not bypass the hierarchy.

Determine the following fields:
- targetEntity (CEO, SYSTEM, SALES, RESEARCH, MARKETING)
- requestedAction (PAUSE_COMPANY, RESUME_COMPANY, VIEW_REPORT, ASK_CEO, UPDATE_SALES, DANGEROUS_ACTION, VIEW_RESEARCH, VIEW_MARKETING, CLARIFY_REQUEST, UNKNOWN)
- riskLevel (LOW, MEDIUM, HIGH)
- requiresApproval (true for HIGH risk actions, false otherwise. Information requests are always LOW and false)

Request: "${text}"

Respond in JSON format ONLY:
{
  "targetEntity": string,
  "requestedAction": string,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "requiresApproval": boolean
}
`;

    let targetEntity = 'SYSTEM';
    let requestedAction = 'UNKNOWN';
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let requiresApproval = false;

    try {
      const response = await this.gateway.callWithTier(
        ModelTier.LOCAL_COMPLEX,
        prompt,
        undefined,
        { json: true }
      );
      
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      targetEntity = parsed.targetEntity || 'SYSTEM';
      requestedAction = parsed.requestedAction || 'UNKNOWN';
      riskLevel = parsed.riskLevel || 'LOW';
      requiresApproval = parsed.requiresApproval || false;
    } catch (e) {
      this.logger.error('Failed to parse Chairman intent via NLP, falling back to safe defaults.');
      targetEntity = 'SYSTEM';
      requestedAction = 'CLARIFY_REQUEST';
      riskLevel = 'LOW';
      requiresApproval = false;
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
      let executionNotes: string | null = null;

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
      } else if (command.requestedAction === 'VIEW_RESEARCH') {
         const latestResearch = await this.prisma.researchProject.findMany({
            where: { companyId: command.companyId },
            orderBy: { createdAt: 'desc' },
            take: 3
         });
         executionNotes = 'Latest Research Projects: ' + latestResearch.map(r => r.name + ' (' + r.status + ')').join(', ');
         if (!latestResearch.length) executionNotes = 'No research found.';
      } else if (command.requestedAction === 'VIEW_MARKETING') {
         const latestCampaigns = await this.prisma.marketingCampaign.findMany({
            where: { companyId: command.companyId },
            orderBy: { createdAt: 'desc' },
            take: 3
         });
         executionNotes = 'Latest Marketing Campaigns: ' + latestCampaigns.map(c => c.name + ' (' + c.status + ')').join(', ');
         if (!latestCampaigns.length) executionNotes = 'No marketing campaigns found.';
      } else if (command.requestedAction === 'CLARIFY_REQUEST') {
         executionNotes = 'Request is ambiguous or requires clarification.';
         return await this.prisma.chairmanCommand.update({
            where: { id: commandId },
            data: { status: 'FAILED', executionNotes }
         });
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
