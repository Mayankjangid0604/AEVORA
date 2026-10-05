import { Injectable, Logger } from '@nestjs/common';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { TaskService } from '../task/task.service';
import { NewVentureService } from '../ventures/new-venture.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { DEFAULT_EMAIL_SCRIPT } from '../sales-outreach/email-outreach.service';
import { CeoDialogueService, parseUrgency } from './ceo-dialogue.service';
import { CeoHiringService } from './ceo-hiring.service';

export const CEO_DECISION_TYPES = [
  'REALLOCATE_AGENT', 'CHANGE_LEAD_CATEGORY', 'ADJUST_OUTREACH_SCRIPT', 'PAUSE_VENTURE', 'HIRE_AGENT', 'ESCALATE_TO_CHAIRMAN',
] as const;
export type CeoDecisionType = (typeof CEO_DECISION_TYPES)[number];
// HIRE_AGENT is auto-approved (Chairman's choice, 2026-09-28); CeoHiringService enforces MAX_HEADCOUNT / MAX_PER_ROLE.
export const AUTO_APPROVED: CeoDecisionType[] = ['REALLOCATE_AGENT', 'CHANGE_LEAD_CATEGORY', 'ADJUST_OUTREACH_SCRIPT', 'PAUSE_VENTURE', 'HIRE_AGENT'];

export interface CeoDecision {
  type: CeoDecisionType | 'PIPELINE_ACTION'; // PIPELINE_ACTION = autonomous pipeline step (Step 43-2), logged only
  reason: string;
  parameters: Record<string, any>;
  outcome?: 'EXECUTED' | 'SKIPPED' | 'ESCALATED' | 'FAILED' | 'BLOCKED';
  detail?: string;
  kind?: ActionKind; // for the Chairman feed; derived from `type` when absent
}

export type ActionKind = 'DECISION' | 'ESCALATION' | 'LEAD_GEN' | 'FOLLOW_UP' | 'SCRIPT' | 'CATEGORY' | 'PIPELINE';

const DAY = 86_400_000;
const TEMPLATE_VARS = ['businessName', 'category', 'chairmanName', 'companyName', 'signature'];

/** Lower-case, trimmed, letters/digits/space/_/- only, ≤40 chars. */
export function cleanCategory(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const c = s.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').slice(0, 40).trim();
  return c || null;
}

/** Apply add/remove to the category list: dedupes, caps at 10, never re-adds a dropped category, never leaves it empty. */
export function applyCategoryChange(current: string[], params: { add?: unknown; remove?: unknown }, dropped: string[] = []) {
  const add = ((Array.isArray(params.add) ? params.add : [params.add]).map(cleanCategory).filter(Boolean) as string[]).filter((c) => !dropped.includes(c));
  const remove = new Set((Array.isArray(params.remove) ? params.remove : [params.remove]).map(cleanCategory).filter(Boolean) as string[]);
  const next = [...new Set([...current.filter((c) => !remove.has(c)), ...add])].slice(0, 10);
  return next.length ? next : current;
}

/** A rewritten script is only accepted if it uses known placeholders and keeps {{businessName}}. */
export function validScript(s: any): { subjectTemplate: string; bodyTemplate: string } | null {
  if (typeof s?.subjectTemplate !== 'string' || typeof s?.bodyTemplate !== 'string') return null;
  const subject = s.subjectTemplate.trim().slice(0, 150);
  const body = s.bodyTemplate.trim().slice(0, 2500);
  if (subject.length < 5 || body.length < 80 || !body.includes('{{businessName}}')) return null;
  const vars = [...`${subject} ${body}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  if (vars.some((v) => !TEMPLATE_VARS.includes(v))) return null;
  return { subjectTemplate: subject, bodyTemplate: body };
}

@Injectable()
export class CeoDecisionsService {
  private readonly logger = new Logger(CeoDecisionsService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TaskService,
    private readonly ventures: NewVentureService,
    private readonly leadGen: LeadGenService,
    private readonly dialogue: CeoDialogueService,
    private readonly hiring: CeoHiringService,
  ) {}

  /** Executes auto-approved decisions, escalates the rest. Never throws: the outcome is recorded on the decision. */
  async apply(companyId: string, ceoId: string, decisions: CeoDecision[], autonomyAllowed: boolean): Promise<CeoDecision[]> {
    const out: CeoDecision[] = [];
    for (const d of decisions) {
      try {
        if (d.type === 'PIPELINE_ACTION') {
          out.push(d);
        } else if (!AUTO_APPROVED.includes(d.type)) {
          out.push({ ...d, ...(await this.escalate(companyId, ceoId, d)) });
        } else if (!autonomyAllowed) {
          out.push({ ...d, outcome: 'BLOCKED', detail: 'CEO_AUTONOMY kill switch is on — proposal only' });
        } else {
          out.push({ ...d, ...(await this.execute(companyId, ceoId, d)) });
        }
      } catch (e) {
        this.logger.error(`[${companyId}] CEO decision ${d.type} failed: ${e.message}`);
        out.push({ ...d, outcome: 'FAILED', detail: String(e.message).slice(0, 300) });
      }
    }
    return out;
  }

  private execute(companyId: string, ceoId: string, d: CeoDecision) {
    switch (d.type) {
      case 'REALLOCATE_AGENT': return this.reallocateAgent(companyId, ceoId);
      case 'CHANGE_LEAD_CATEGORY': return this.changeLeadCategory(companyId, ceoId, d.parameters);
      case 'ADJUST_OUTREACH_SCRIPT': return this.adjustOutreachScript(companyId, d.reason);
      case 'PAUSE_VENTURE': return this.pauseVenture(companyId);
      case 'HIRE_AGENT': return this.hiring.hire(companyId, ceoId, d.parameters, d.reason).then(({ outcome, detail }) => ({ outcome, detail }));
      default: return Promise.resolve({ outcome: 'SKIPPED' as const, detail: 'not auto-approvable' });
    }
  }

  /** ESCALATE_TO_CHAIRMAN → a CeoQuestion pushed to the Chairman; anything else not auto-approved → a PROPOSED ManagementDecision. */
  private async escalate(companyId: string, ceoId: string, d: CeoDecision) {
    if (d.type === 'ESCALATE_TO_CHAIRMAN') {
      const question = typeof d.parameters.question === 'string' && d.parameters.question.trim() ? d.parameters.question : d.reason;
      const r = await this.dialogue.ask(companyId, question, { reason: d.reason, parameters: d.parameters }, parseUrgency(d.parameters.urgency));
      return 'question' in r
        ? { outcome: 'ESCALATED' as const, detail: `Asked you: "${r.question!.question}"` }
        : { outcome: 'SKIPPED' as const, detail: `Question not sent: ${r.skipped}` };
    }
    const decision = await this.prisma.managementDecision.create({
      data: {
        companyId,
        type: d.type === 'HIRE_AGENT' ? 'HIRING' : 'GENERAL',
        title: `CEO proposal: ${d.type === 'HIRE_AGENT' ? 'hire an agent' : 'needs your input'}`,
        description: d.reason,
        proposerId: ceoId,
        payload: { source: 'CEO_REVIEW', ceoDecisionType: d.type, parameters: d.parameters },
        status: 'PROPOSED',
      },
    });
    return { outcome: 'ESCALATED' as const, detail: `ManagementDecision ${decision.id}` };
  }

  /** Idle agent (preferably from a paused venture) → task supporting the highest-value open client project. */
  private async reallocateAgent(companyId: string, ceoId: string) {
    const project = await this.prisma.clientProject.findFirst({
      where: { companyId, status: { in: ['SCOPING', 'BUILDING', 'REVISION', 'SAMPLE_SENT'] } },
      orderBy: [{ quotedAmount: 'desc' }, { createdAt: 'asc' }],
      include: { lead: { select: { name: true } } },
    });
    if (!project) return { outcome: 'SKIPPED' as const, detail: 'no open client project to staff' };

    const title = `Support client project: ${project.lead.name}`.slice(0, 200);
    const already = await this.prisma.task.findFirst({ where: { companyId, title, status: { in: ['BACKLOG', 'READY', 'IN_PROGRESS'] } } });
    if (already) return { outcome: 'SKIPPED' as const, detail: `already staffed (task ${already.id})` };

    const idle = await this.prisma.employee.findMany({
      where: {
        companyId,
        id: { not: ceoId },
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        agent: { status: 'ACTIVE' },
        assignedTasks: { none: { status: { in: ['READY', 'IN_PROGRESS'] } } },
      },
      include: { ventureTeams: { include: { venture: { select: { status: true } } } } },
      take: 20,
    });
    if (!idle.length) return { outcome: 'SKIPPED' as const, detail: 'no idle agent available' };
    const fromPaused = idle.find((e) => e.ventureTeams.some((t) => t.venture.status === 'PAUSED'));
    const pick = fromPaused ?? idle[0];

    const task = await this.tasks.createTask({
      companyId,
      createdBy: ceoId,
      title,
      description: `Reassigned by the CEO to the highest-value open client project (${project.projectType}, ${project.status}).`,
      assignedEmployeeId: pick.id,
    });
    return { outcome: 'EXECUTED' as const, detail: `${pick.name} → task ${task.id} (${project.lead.name})` };
  }

  private async changeLeadCategory(companyId: string, ceoId: string, params: Record<string, any>) {
    const current = await this.leadGen.categoriesFor(companyId);
    const config = await this.prisma.leadGenConfig.findUnique({ where: { companyId } });
    const next = applyCategoryChange(current, params, config?.dropped ?? []);
    if (next.join('|') === current.join('|')) return { outcome: 'SKIPPED' as const, detail: 'no valid change' };
    const dropped = [...new Set([...(config?.dropped ?? []), ...current.filter((c) => !next.includes(c))])];
    await this.prisma.leadGenConfig.upsert({
      where: { companyId },
      create: { companyId, categories: next, dropped, updatedBy: ceoId },
      update: { categories: next, dropped, updatedBy: ceoId },
    });
    return { outcome: 'EXECUTED' as const, detail: `categories: ${current.join(', ')} → ${next.join(', ')}` };
  }

  /** Rewrite the active email script from response-rate data; new version becomes active, old ones inactive. */
  private async adjustOutreachScript(companyId: string, reason: string) {
    const current = await this.prisma.outreachScript.findFirst({ where: { companyId, channel: 'EMAIL', isActive: true }, orderBy: { updatedAt: 'desc' } });
    const since = new Date(Date.now() - 14 * DAY);
    const [sent, responded] = await Promise.all([
      this.prisma.outreachCampaign.count({ where: { companyId, channel: 'EMAIL', sentAt: { gte: since } } }),
      this.prisma.outreachCampaign.count({ where: { companyId, channel: 'EMAIL', sentAt: { gte: since }, outcome: { in: ['INTERESTED', 'BOOKED'] } } }),
    ]);
    if (sent < 5) return { outcome: 'SKIPPED' as const, detail: `only ${sent} emails sent in 14 days — not enough data` };

    const res = await this.gateway.generate({
      systemMessage: `You improve cold outreach emails for a small Indian web/automation agency writing to local businesses.
Return JSON only: {"subjectTemplate": string, "bodyTemplate": string}.
Allowed placeholders: {{businessName}}, {{category}}, {{chairmanName}}, {{companyName}}. The body must include {{businessName}}.
Keep it short, warm, specific, no hype, one clear call to action.`,
      prompt: JSON.stringify({
        currentSubject: current?.subjectTemplate ?? DEFAULT_EMAIL_SCRIPT.subjectTemplate,
        currentBody: current?.bodyTemplate ?? DEFAULT_EMAIL_SCRIPT.bodyTemplate,
        emailsSent14d: sent,
        positiveResponses14d: responded,
        ceoReason: reason,
      }),
      requireStructuredOutput: true,
      temperature: 0.4,
    });
    const script = validScript(res.structuredOutput);
    if (!script) return { outcome: 'FAILED' as const, detail: 'model returned an invalid script; kept the current one' };

    const version = (await this.prisma.outreachScript.count({ where: { companyId, channel: 'EMAIL' } })) + 1;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.outreachScript.updateMany({ where: { companyId, channel: 'EMAIL', isActive: true }, data: { isActive: false } });
      return tx.outreachScript.create({ data: { companyId, channel: 'EMAIL', templateName: `ceo-email-v${version}-${Date.now()}`, ...script } });
    });
    return { outcome: 'EXECUTED' as const, detail: `new script ${created.templateName} (response rate was ${Math.round((responded / sent) * 100)}%)` };
  }

  /** Pause the ACTIVE venture (older than 7 days) whose team had no task activity in the last 7 days. */
  private async pauseVenture(companyId: string) {
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const ventures = await this.prisma.venture.findMany({
      where: { companyId, status: 'ACTIVE', createdAt: { lt: weekAgo } },
      include: { team: { select: { employeeId: true } } },
    });
    let quietest: { id: string; name: string; activity: number } | null = null;
    for (const v of ventures) {
      const activity = await this.prisma.task.count({
        where: { companyId, assignedEmployeeId: { in: v.team.map((t) => t.employeeId) }, updatedAt: { gte: weekAgo } },
      });
      if (!quietest || activity < quietest.activity) quietest = { id: v.id, name: v.name, activity };
    }
    // ponytail: only pauses fully idle ventures; a relative "lowest activity" rule could pause a healthy one.
    if (!quietest || quietest.activity > 0) return { outcome: 'SKIPPED' as const, detail: 'no venture idle for 7+ days' };
    await this.ventures.setStatus(companyId, quietest.id, 'PAUSED');
    return { outcome: 'EXECUTED' as const, detail: `paused venture "${quietest.name}" (no task activity in 7 days)` };
  }
}
