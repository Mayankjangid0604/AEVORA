import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { SurvivalService } from '../survival/survival.service';
import { TaskService } from '../task/task.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { bandSalaryAC } from '../config/salary-bands';

export interface VenturePlan {
  ventureName: string;
  teamNeeded: { role: string; skills: string[] }[];
  firstTask: string;
  estimatedTimeline: string;
}

const PLAN_SYSTEM = `You plan lean startup ventures inside a small AI-run company in India.
Return JSON only:
{"ventureName": string, "teamNeeded": [{"role": string, "skills": string[]}], "firstTask": string, "estimatedTimeline": string}
Keep the team small (2–5). Include a "Product Manager" role.`;

export function normalizePlan(raw: any, idea: string, maxTeam: number): VenturePlan {
  const team = (Array.isArray(raw?.teamNeeded) ? raw.teamNeeded : [])
    .filter((m: any) => typeof m?.role === 'string' && m.role.trim())
    .slice(0, maxTeam)
    .map((m: any) => ({ role: m.role.trim().slice(0, 80), skills: (Array.isArray(m.skills) ? m.skills : []).map(String).slice(0, 10) }));
  if (!team.some((m) => /product manager/i.test(m.role))) {
    team.unshift({ role: 'Product Manager', skills: ['planning', 'user research'] });
    if (team.length > maxTeam) team.pop();
  }
  return {
    ventureName: String(raw?.ventureName || idea).slice(0, 80),
    teamNeeded: team,
    firstTask: String(raw?.firstTask || `Research the market for: ${idea}`).slice(0, 300),
    estimatedTimeline: String(raw?.estimatedTimeline || 'unknown'),
  };
}

@Injectable()
export class NewVentureService {
  private readonly logger = new Logger(NewVentureService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly survival: SurvivalService,
    private readonly tasks: TaskService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Chairman idea → venture with a team and a first task. Chairman-initiated, so chairmanApproved = true.
   * Idempotent on `idempotencyKey` (voice command id or client key).
   */
  async spawnTeam(idea: string, companyId: string, opts: { idempotencyKey: string; voiceCommandId?: string }) {
    idea = idea?.trim();
    if (!idea) throw new BadRequestException('idea is required');
    const key = `venture:${opts.idempotencyKey}`;
    const existing = await this.prisma.venture.findUnique({ where: { idempotencyKey: key }, include: { team: true } });
    if (existing) {
      if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to another company');
      if (existing.status !== 'FAILED') return existing;
      // A retry of a failed formation: the team transaction rolled back, so re-form from the saved plan.
      await this.prisma.venture.update({ where: { id: existing.id }, data: { status: 'FORMING', error: null } });
      return this.formOrFail(existing.id, companyId, existing.plan as unknown as VenturePlan);
    }

    const survival = await this.survival.checkSurvival(companyId);
    if (!survival.alive) throw new ForbiddenException('Company is shut down (insufficient funds) — deposit before starting ventures');

    const maxTeam = Number(process.env.VENTURE_MAX_TEAM ?? 5);
    const res = await this.gateway.generate({ systemMessage: PLAN_SYSTEM, prompt: idea, requireStructuredOutput: true, temperature: 0.3 });
    const plan = normalizePlan(res.structuredOutput, idea, maxTeam);

    let venture;
    try {
      venture = await this.prisma.venture.create({
        data: {
          companyId, idea, name: plan.ventureName, plan: plan as any, chairmanApproved: true,
          voiceCommandId: opts.voiceCommandId, idempotencyKey: key,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.venture.findUniqueOrThrow({ where: { idempotencyKey: key }, include: { team: true } });
      }
      throw e;
    }

    return this.formOrFail(venture.id, companyId, plan);
  }

  private async formOrFail(ventureId: string, companyId: string, plan: VenturePlan) {
    try {
      return await this.formTeam(ventureId, companyId, plan);
    } catch (e) {
      this.logger.error(`Venture ${ventureId} formation failed: ${e.message}`);
      await this.prisma.venture.update({ where: { id: ventureId }, data: { status: 'FAILED', error: String(e.message).slice(0, 1000) } });
      throw e;
    }
  }

  private async formTeam(ventureId: string, companyId: string, plan: VenturePlan) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });

    const { dept, members } = await this.prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({ data: { companyId, name: `Venture: ${plan.ventureName}`.slice(0, 120) } });
      const taken = new Set<string>();
      const members: { employeeId: string; role: string }[] = [];

      for (const need of plan.teamNeeded) {
        const reuse = await this.findAvailable(tx, companyId, need, taken);
        const employeeId = reuse ?? (await this.createAiEmployee(tx, companyId, dept.id, ventureId, need, company.chairmanId));
        taken.add(employeeId);
        members.push({ employeeId, role: need.role });
        await tx.ventureTeam.create({ data: { ventureId, employeeId, role: need.role } });
      }
      await tx.venture.update({ where: { id: ventureId }, data: { departmentId: dept.id, teamSize: members.length } });
      return { dept, members };
      // ~7 sequential queries per member over a remote DB (Neon) blows Prisma's 5 s default.
    }, { maxWait: 10_000, timeout: 60_000 });

    const pm = members.find((m) => /product manager/i.test(m.role)) ?? members[0];
    const task = await this.tasks.createTask({
      companyId,
      createdBy: company.chairmanId,
      title: plan.firstTask.slice(0, 200),
      description: `First task for venture "${plan.ventureName}". Timeline: ${plan.estimatedTimeline}`,
      assignedEmployeeId: pm?.employeeId,
    });

    const venture = await this.prisma.venture.update({
      where: { id: ventureId },
      data: { status: 'ACTIVE', firstTaskId: task.id },
      include: { team: true },
    });
    this.realtime.broadcastToUser(company.chairmanId, 'venture.formed', {
      ventureId, name: plan.ventureName, teamSize: members.length,
      message: `New venture '${plan.ventureName}' formed with ${members.length} team members`,
    });
    this.logger.log(`Venture ${ventureId} '${plan.ventureName}' ACTIVE, team ${members.length}, dept ${dept.id}`);
    return venture;
  }

  /** ACTIVE+AVAILABLE employee not already on an ACTIVE/FORMING venture, matching role title or ≥1 skill. */
  private async findAvailable(tx: Prisma.TransactionClient, companyId: string, need: { role: string; skills: string[] }, taken: Set<string>) {
    const candidates = await tx.employee.findMany({
      where: {
        companyId, status: 'ACTIVE', availability: 'AVAILABLE',
        id: { notIn: [...taken] },
        ventureTeams: { none: { venture: { status: { in: ['FORMING', 'ACTIVE'] } } } },
        OR: [
          { role: { title: { equals: need.role, mode: 'insensitive' } } },
          ...need.skills.map((s) => ({ skills: { some: { name: { equals: s, mode: 'insensitive' as const } } } })),
        ],
      },
      include: { role: true },
      take: 10,
    });
    const byRole = candidates.find((c) => c.role.title.toLowerCase() === need.role.toLowerCase());
    return (byRole ?? candidates[0])?.id ?? null;
  }

  /** New AI worker (Employee + wallet + Agent + WorkerProfile), same shape as AIWorkforceService.executeProvisioning. */
  private async createAiEmployee(tx: Prisma.TransactionClient, companyId: string, departmentId: string, ventureId: string, need: { role: string; skills: string[] }, actorId: string) {
    const role =
      (await tx.role.findFirst({ where: { companyId, title: { equals: need.role, mode: 'insensitive' } } })) ??
      (await tx.role.create({ data: { companyId, title: need.role, description: 'Created for a venture team' } }));
    const emp = await tx.employee.create({
      data: {
        name: `${need.role} (AI)`,
        identitySeed: `VENTURE-${ventureId}-${need.role}`,
        companyId, departmentId, roleId: role.id, salary: bandSalaryAC(role), status: 'ACTIVE',
        skills: { create: need.skills.map((s) => ({ name: s, category: 'VENTURE', proficiency: 50 })) },
        history: { create: [{ eventType: 'AI_PROVISIONED', newValue: 'ACTIVE', actor: actorId }] },
      },
    });
    await tx.aCWallet.create({ data: { employeeId: emp.id, balance: 0 } });
    await tx.agent.create({
      data: {
        employeeId: emp.id, status: 'ACTIVE', autonomyLevel: 'ASSISTED',
        configuration: { systemRole: `${need.role} for venture ${ventureId}`, skills: need.skills, ventureId } as any,
      },
    });
    await tx.workerProfile.create({
      data: { employeeId: emp.id, workerType: 'AI_AGENT', companyId, autonomyLevel: 'ASSISTED', aiSystemRole: need.role, aiCapabilities: need.skills as any },
    });
    return emp.id;
  }

  list(companyId: string) {
    return this.prisma.venture.findMany({
      where: { companyId },
      include: { team: { include: { employee: { select: { id: true, name: true, status: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setStatus(companyId: string, id: string, status: 'PAUSED' | 'ACTIVE' | 'CLOSED') {
    const v = await this.prisma.venture.updateMany({ where: { id, companyId, status: { in: ['ACTIVE', 'PAUSED'] } }, data: { status } });
    if (!v.count) throw new NotFoundException('Venture not found or not changeable');
    return this.prisma.venture.findUniqueOrThrow({ where: { id } });
  }
}
