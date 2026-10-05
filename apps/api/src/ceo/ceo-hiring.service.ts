import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { VoiceService } from '../voice/voice.service';
import { canonicalDepartment, freeChairsFor, roomStates } from './office-rooms';
import { bandSalaryAC } from '../config/salary-bands';

const DAY = 86_400_000;

/** Hard safety limits. The CEO hires on its own (Chairman's choice); these stop a runaway model. */
/** Real limit = desk chairs in each office room (office-rooms.ts). MAX_HEADCOUNT is only a runaway backstop. */
export const hiringLimits = () => ({
  maxHeadcount: Math.max(1, Number(process.env.MAX_HEADCOUNT ?? 100) || 100),
});

/** Titles the CEO may never create — only the Chairman appoints these. */
const RESERVED_TITLE = /\b(ceo|chief executive|chairman|owner|founder|board)\b/i;

/** First names for new hires, used in order, skipping names already taken in the company. */
export const NAME_POOL = [
  'Aarav', 'Diya', 'Kabir', 'Isha', 'Vihaan', 'Ananya', 'Arjun', 'Meera', 'Rohan', 'Saanvi',
  'Dev', 'Priya', 'Karan', 'Tara', 'Aditya', 'Nisha', 'Yash', 'Kavya', 'Neel', 'Riya',
  'Veer', 'Pooja', 'Ishaan', 'Sneha', 'Aryan', 'Zoya', 'Raghav', 'Anika', 'Siddharth', 'Myra',
];

export interface HireParams {
  role: string;
  department: string;
  responsibilities: string;
  name?: string;
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/[^\p{L}\p{N} &/,.()'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** Model parameters → a safe hire request, or a reason it can't be done. Accepts a few key spellings small models use. */
export function normalizeHireParams(p: Record<string, any>, reason = ''): HireParams | { error: string } {
  const role = titleCase(clean(p?.role ?? p?.roleTitle ?? p?.title ?? p?.position, 60));
  if (role.length < 2) return { error: 'no role given (parameters.role)' };
  if (RESERVED_TITLE.test(role)) return { error: `"${role}" can only be appointed by the Chairman` };
  const given = clean(p?.department ?? p?.dept ?? p?.team, 40);
  const department = given ? canonicalDepartment(titleCase(given)) : guessDepartment(role);
  const responsibilities = clean(p?.responsibilities ?? p?.duties ?? p?.description, 400) || clean(reason, 400) || `Work as ${role}`;
  const name = clean(p?.name, 30).split(' ')[0] || undefined;
  return { role, department, responsibilities, ...(name ? { name: titleCase(name) } : {}) };
}

/** Department from a role title when the model leaves it out. */
export function guessDepartment(role: string): string {
  const r = role.toLowerCase();
  if (/financ|accountant|accounts|billing|bookkeep/.test(r)) return 'Finance';
  if (/sales|business development|account (?:exec|manager)/.test(r)) return 'Sales';
  if (/market|content|social|seo|brand/.test(r)) return 'Marketing';
  if (/design|ux|ui\b|product/.test(r)) return 'Product';
  if (/develop|engineer|programmer|web|software|qa|test|devops/.test(r)) return 'Engineering / IT';
  if (/support|customer|success|reception/.test(r)) return 'Customer Support';
  if (/project|delivery|operations|ops/.test(r)) return 'Projects & Operations';
  if (/\bhr\b|recruit|people|talent/.test(r)) return 'Human Resources';
  if (/legal|compliance/.test(r)) return 'Legal & Compliance';
  if (/analyst|data/.test(r)) return 'Data & Analytics';
  if (/research/.test(r)) return 'Research & Development';
  if (/strategy|planning/.test(r)) return 'Strategy & Planning';
  return 'Projects & Operations';
}

/** Seniority from the title: 8 director/head, 6 manager/lead, 3 everyone else. */
export function roleLevel(role: string) {
  if (/\b(director|head|vp|vice president)\b/i.test(role)) return 8;
  if (/\b(manager|lead|senior|principal)\b/i.test(role)) return 6;
  return 3;
}

/** A name nobody in the company has yet: the requested one if free, else the pool, else Pool-N. */
export function pickName(taken: string[], requested?: string) {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (requested && !used.has(requested.toLowerCase())) return requested;
  const free = NAME_POOL.find((n) => !used.has(n.toLowerCase()));
  if (free) return free;
  for (let i = 2; ; i++) {
    const n = `${NAME_POOL[taken.length % NAME_POOL.length]} ${i}`;
    if (!used.has(n.toLowerCase())) return n;
  }
}

export function agentInstructions(name: string, h: HireParams, companyName: string) {
  return `You are ${name}, ${h.role} in the ${h.department} department at ${companyName}, an AI-run web, SaaS and automation agency headquartered in India that serves clients across India and internationally. ` +
    `Your responsibilities: ${h.responsibilities}. You report to the CEO. Work toward paying clients and revenue; quote in the client's currency (INR for India), be concise and professional in the client's language.`;
}

export type HireOutcome =
  | { outcome: 'EXECUTED'; detail: string; employeeId: string }
  | { outcome: 'SKIPPED'; detail: string; roomFull?: string };

@Injectable()
export class CeoHiringService {
  private readonly logger = new Logger(CeoHiringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly voice: VoiceService,
  ) {}

  /** What the CEO sees about its own team in the review snapshot. */
  async teamSnapshot(companyId: string) {
    const { maxHeadcount } = hiringLimits();
    const rooms = [...(await roomStates(this.prisma, companyId)).values()].filter((r) => r.used > 0 || r.reported);
    const members = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { name: true, hireDate: true, role: { select: { title: true } }, department: { select: { name: true } } },
      orderBy: { hireDate: 'asc' },
      take: 60,
    });
    return {
      headcount: members.length,
      maxHeadcount,
      officeRooms: rooms.map((r) => ({ room: r.name, chairs: r.chairs, used: r.used, free: r.free })),
      note: 'You can only hire into a room with a free chair. Delivery staff (developers, designers, project managers) are hired automatically per client project; use HIRE_AGENT for other missing functions.',
      canHire: members.length < maxHeadcount,
      members: members.slice(0, 40).map((m) => ({ name: m.name, role: m.role?.title ?? '?', department: m.department?.name ?? '?' })),
      hiredLast24h: members.filter((m) => m.hireDate.getTime() > Date.now() - DAY).map((m) => `${m.name} (${m.role?.title})`),
    };
  }

  /** CEO HIRE_AGENT → a working AI employee (Employee + Agent + wallet + profile + voice). Never throws on business rules. */
  async hire(companyId: string, ceoId: string, params: Record<string, any>, reason = '', opts: { project?: string } = {}): Promise<HireOutcome> {
    const h = normalizeHireParams(params, reason);
    if ('error' in h) return { outcome: 'SKIPPED', detail: h.error };

    const { maxHeadcount } = hiringLimits();
    const active = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { name: true, hireDate: true, role: { select: { title: true } } },
    });
    if (active.length >= maxHeadcount) return { outcome: 'SKIPPED', detail: `headcount limit reached (${active.length}/${maxHeadcount}, MAX_HEADCOUNT)` };

    const sameRole = active.filter((e) => e.role?.title?.toLowerCase() === h.role.toLowerCase());
    const room = await freeChairsFor(this.prisma, companyId, h.department);
    if (room.free <= 0) return { outcome: 'SKIPPED', detail: `${room.state?.name ?? h.department} room is full (${room.state?.used}/${room.state?.chairs} chairs)`, roomFull: room.key ?? undefined } as HireOutcome;
    // Reviews run every sim hour; without this the CEO re-hires the same role each time it re-reads the same data.
    // Project staffing is exempt: it hires exactly the gap a project needs.
    const recent = opts.project ? null : sameRole.find((e) => e.hireDate.getTime() > Date.now() - DAY);
    if (recent) return { outcome: 'SKIPPED', detail: `${recent.name} was hired as ${h.role} in the last 24h — give them time first` };

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, chairmanId: true } });
    const allNames = await this.prisma.employee.findMany({ where: { companyId }, select: { name: true } });
    const name = pickName(allNames.map((e) => e.name), h.name);

    const emp = await this.prisma.$transaction(async (tx) => {
      const dept =
        (await tx.department.findFirst({ where: { companyId, name: { equals: h.department, mode: 'insensitive' } } })) ??
        (await tx.department.create({ data: { companyId, name: h.department, status: 'ACTIVE' } }));
      const role =
        (await tx.role.findFirst({ where: { companyId, title: { equals: h.role, mode: 'insensitive' } } })) ??
        (await tx.role.create({ data: { title: h.role, level: roleLevel(h.role), company: { connect: { id: companyId } } } }));

      const e = await tx.employee.create({
        data: {
          name,
          identitySeed: `${name.toLowerCase().replace(/\s+/g, '.')}.${Date.now().toString(36)}@ai.${companyId.slice(0, 8)}`,
          companyId,
          departmentId: dept.id,
          roleId: role.id,
          salary: bandSalaryAC(role), // monthly AC band by role (config/salary-bands.ts)
          status: 'ACTIVE',
          activity: 'IDLE',
          history: { create: [{ eventType: 'HIRED', newValue: 'ACTIVE', actor: ceoId }] },
        },
      });
      await tx.aCWallet.create({ data: { employeeId: e.id, balance: 0 } }); // payroll pays into this
      await tx.agent.create({
        data: {
          employeeId: e.id,
          status: 'ACTIVE',
          autonomyLevel: 'ASSISTED',
          configuration: { systemInstructions: agentInstructions(name, h, company.name), hiredBy: 'CEO', responsibilities: h.responsibilities },
        },
      });
      await tx.aCWallet.create({ data: { employeeId: e.id, balance: 0 } });
      // Older DBs seeded ARIA without a WorkerProfile; create it so every hire reports to the CEO.
      const ceoProfile = await tx.workerProfile.upsert({
        where: { employeeId: ceoId },
        update: {},
        create: { employeeId: ceoId, companyId, workerType: 'AI_EXECUTIVE', autonomyLevel: 'AUTONOMOUS', onboardingAt: new Date() },
      });
      await tx.workerProfile.create({
        data: { employeeId: e.id, companyId, workerType: 'AI_AGENT', autonomyLevel: 'ASSISTED', onboardingAt: new Date(), managerId: ceoProfile?.id ?? null },
      });
      await tx.companyEvent.create({
        data: { companyId, type: 'EMPLOYEE_HIRED', payload: { employeeId: e.id, name, role: h.role, department: h.department, hiredBy: ceoId, reason: reason.slice(0, 300) } },
      });
      return { ...e, roleTitle: role.title, deptName: dept.name };
    });

    // Voice is cosmetic — a failure here must not undo the hire.
    await this.voice.assignVoice(emp.id).catch((err) => this.logger.warn(`voice for ${emp.id} not assigned: ${err.message}`));

    // Item 32: no push/email per hire any more — hires go into the Chairman's month-end digest (MonthlyService).
    this.logger.log(`[${companyId}] CEO hired ${name} as ${emp.roleTitle} (${emp.deptName})`);
    return { outcome: 'EXECUTED', detail: `Hired ${name} as ${emp.roleTitle} in ${emp.deptName}`, employeeId: emp.id };
  }
}
