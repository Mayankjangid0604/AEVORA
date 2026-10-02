import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationService } from '../simulation/simulation.service';
import { NewVentureService } from '../ventures/new-venture.service';
import { findCeo } from '../ceo/ceo-review.service';
import { BoardroomService } from '../boardroom/boardroom.service';
import { isUrgentBoardMeetingCommand } from '../boardroom/boardroom.logic';

export const VOICE_INTENTS = ['NEW_STARTUP_IDEA', 'STATUS_REPORT', 'COMMAND_CEO', 'ADD_EMPLOYEE', 'CHECK_REVENUE', 'PAUSE_SIMULATION', 'CUSTOM'] as const;
export type VoiceIntentName = (typeof VOICE_INTENTS)[number];

export interface VoiceIntent {
  intent: VoiceIntentName;
  target: string;
  parameters: Record<string, any>;
  naturalLanguageReply: string;
}

const PARSER_SYSTEM = `You are AEVORA's voice command parser. Extract structured intent from the Chairman's spoken command. Return JSON only:
{
  "intent": "NEW_STARTUP_IDEA | STATUS_REPORT | COMMAND_CEO | ADD_EMPLOYEE | CHECK_REVENUE | PAUSE_SIMULATION | CUSTOM",
  "target": "CEO | SIMULATION | FINANCE | SALES | RESEARCH",
  "parameters": {},
  "naturalLanguageReply": "Friendly 1-sentence acknowledgement"
}
For NEW_STARTUP_IDEA put the idea text in parameters.idea. For COMMAND_CEO put the instruction in parameters.instruction.`;

export function normalizeIntent(raw: any, transcript: string): VoiceIntent {
  const intent = VOICE_INTENTS.includes(raw?.intent) ? raw.intent : 'CUSTOM';
  return {
    intent,
    target: typeof raw?.target === 'string' ? raw.target : 'CEO',
    parameters: raw?.parameters && typeof raw.parameters === 'object' ? raw.parameters : {},
    naturalLanguageReply: typeof raw?.naturalLanguageReply === 'string' && raw.naturalLanguageReply
      ? raw.naturalLanguageReply
      : `Got it: "${transcript.slice(0, 80)}".`,
  };
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

@Injectable()
export class VoiceCommandService {
  private readonly logger = new Logger(VoiceCommandService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly simulation: SimulationService,
    private readonly ventures: NewVentureService,
    private readonly boardroom: BoardroomService,
  ) {}

  async startSession(companyId: string) {
    return this.prisma.voiceSession.create({ data: { companyId } });
  }

  async endSession(companyId: string, sessionId: string) {
    const s = await this.prisma.voiceSession.updateMany({ where: { id: sessionId, companyId, endedAt: null }, data: { endedAt: new Date() } });
    if (!s.count) throw new NotFoundException('Open voice session not found');
    return { ended: true };
  }

  async parseIntent(transcript: string): Promise<VoiceIntent> {
    try {
      const res = await this.gateway.generate({ systemMessage: PARSER_SYSTEM, prompt: transcript, requireStructuredOutput: true, temperature: 0 });
      return normalizeIntent(res.structuredOutput, transcript);
    } catch (e) {
      this.logger.warn(`Intent parse failed, routing as CUSTOM: ${e.message}`);
      return normalizeIntent(null, transcript);
    }
  }

  async processCommand(transcript: string, companyId: string, actorId: string, sessionId?: string) {
    transcript = transcript?.trim();
    if (!transcript) throw new BadRequestException('transcript is required');
    if (transcript.length > 2000) throw new BadRequestException('transcript too long');
    if (sessionId) {
      const s = await this.prisma.voiceSession.updateMany({ where: { id: sessionId, companyId }, data: { commandCount: { increment: 1 } } });
      if (!s.count) throw new NotFoundException('Voice session not found');
    }

    // "Urgent board meeting" is matched locally (no model call) and starts at once with the Chairman leading.
    if (isUrgentBoardMeetingCommand(transcript)) {
      const m = await this.boardroom.urgentNow(companyId);
      const reply = `Urgent board meeting called. ${m.participants.length} ${m.participants.length === 1 ? 'person is' : 'people are'} heading to the Boardroom — you lead it.`;
      await this.prisma.voiceCommand.create({ data: { companyId, sessionId, actorId, transcript, intent: { intent: 'URGENT_BOARD_MEETING', meetingId: m.id } as any, routedTo: 'BOARDROOM', response: reply, status: 'EXECUTED', executedAt: new Date() } });
      return { commandId: m.id, intent: 'URGENT_BOARD_MEETING', naturalLanguageReply: reply, meetingId: m.id };
    }
    const intent = await this.parseIntent(transcript);
    const command = await this.prisma.voiceCommand.create({
      data: { companyId, sessionId, actorId, transcript, intent: intent as any },
    });

    try {
      const { reply, routedTo } = await this.route(intent, transcript, companyId, command.id);
      await this.prisma.voiceCommand.update({
        where: { id: command.id },
        data: { routedTo, response: reply, status: 'EXECUTED', executedAt: new Date() },
      });
      return { commandId: command.id, intent: intent.intent, naturalLanguageReply: reply };
    } catch (e) {
      const reply = `Sorry, I couldn't do that: ${e.message}`;
      await this.prisma.voiceCommand.update({ where: { id: command.id }, data: { status: 'FAILED', error: e.message, response: reply } });
      return { commandId: command.id, intent: intent.intent, naturalLanguageReply: reply };
    }
  }

  private async route(i: VoiceIntent, transcript: string, companyId: string, commandId: string) {
    switch (i.intent) {
      case 'STATUS_REPORT':
        return { reply: await this.statusReport(companyId), routedTo: 'CHAIRMAN' };
      case 'CHECK_REVENUE':
        return { reply: await this.revenueReport(companyId), routedTo: 'CHAIRMAN' };
      case 'PAUSE_SIMULATION':
        await this.simulation.pause(companyId);
        return { reply: 'Simulation paused.', routedTo: 'CHAIRMAN' };
      case 'NEW_STARTUP_IDEA': {
        const idea = typeof i.parameters.idea === 'string' && i.parameters.idea.trim() ? i.parameters.idea : transcript;
        const v = await this.ventures.spawnTeam(idea, companyId, { idempotencyKey: `voice:${commandId}`, voiceCommandId: commandId });
        return { reply: `New venture '${v.name}' formed with ${v.teamSize} team members.`, routedTo: 'CEO' };
      }
      case 'COMMAND_CEO':
      case 'ADD_EMPLOYEE':
      case 'CUSTOM':
      default:
        await this.directiveToCeo(companyId, i, transcript, commandId);
        return { reply: i.naturalLanguageReply, routedTo: 'CEO' };
    }
  }

  /** Chairman directive → ManagementDecision (pre-approved) targeted at the CEO agent. */
  private async directiveToCeo(companyId: string, i: VoiceIntent, transcript: string, commandId: string) {
    const ceo = await findCeo(this.prisma, companyId);
    if (!ceo) throw new Error('no active CEO employee to receive the command');
    const chairman = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    await this.prisma.managementDecision.create({
      data: {
        companyId,
        type: i.intent === 'ADD_EMPLOYEE' ? 'HIRING' : 'GENERAL',
        title: `Chairman voice directive: ${transcript.slice(0, 80)}`,
        description: i.parameters.instruction ?? transcript,
        proposerId: ceo.id, // proposer must be an Employee; the Chairman is recorded as approver
        targetEmployeeId: ceo.id,
        payload: { source: 'CHAIRMAN_VOICE', voiceCommandId: commandId, intent: i.intent, parameters: i.parameters, transcript },
        status: 'APPROVED',
        approvedBy: chairman.chairmanId,
        approvedAt: new Date(),
      },
    });
  }

  private async statusReport(companyId: string) {
    const [account, survival, activeEmployees, newLeads, openProjects, pendingDecisions] = await Promise.all([
      this.prisma.realMoneyAccount.findUnique({ where: { companyId } }),
      this.prisma.survivalConfig.findUnique({ where: { companyId } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.salesLead.count({ where: { companyId, status: 'NEW' } }),
      this.prisma.clientProject.count({ where: { companyId, status: { notIn: ['PAID', 'CLOSED', 'FAILED'] } } }),
      this.prisma.managementDecision.count({ where: { companyId, status: 'PROPOSED' } }),
    ]);
    return `Balance ${rupees(account?.balance ?? 0)}, status ${survival?.currentStatus ?? 'unknown'}. ` +
      `${activeEmployees} active employees, ${newLeads} new leads, ${openProjects} open client projects, ${pendingDecisions} decisions awaiting you.`;
  }

  private async revenueReport(companyId: string) {
    const account = await this.prisma.realMoneyAccount.findUnique({
      where: { companyId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!account) return 'No real money account yet — balance is zero.';
    const tx = account.transactions.map((t) => `${t.amount >= 0 ? '+' : '-'}${rupees(Math.abs(t.amount))} ${t.description}`).join('; ');
    return `Balance ${rupees(account.balance)}.${tx ? ` Last transactions: ${tx}.` : ''}`;
  }

  listCommands(companyId: string) {
    return this.prisma.voiceCommand.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
