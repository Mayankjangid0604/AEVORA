import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { findCeo } from './ceo-review.service';
import { CeoHiringService, hiringLimits } from './ceo-hiring.service';
import { RoomState, roomKeyFor, roomStates } from './office-rooms';

const DAY = 86_400_000;

/** Projects that still need people. */
export const ACTIVE_PROJECT_STATUSES = ['SCOPING', 'BUILDING', 'SAMPLE_SENT', 'REVISION', 'APPROVED', 'INVOICED'] as const;
/** Projects whose people go back to the pool. */
export const DONE_PROJECT_STATUSES = ['PAID', 'CLOSED', 'FAILED'] as const;

/** Base team per project type. */
export const TEAM_TEMPLATES: Record<string, Record<string, number>> = {
  WEBSITE: { 'Web Developer': 1, 'Graphic Designer': 1, 'Project Manager': 1 },
  SAAS: { 'Web Developer': 3, 'Graphic Designer': 1, 'Project Manager': 1 },
  AUTOMATION: { 'Web Developer': 2, 'Project Manager': 1 },
  APP: { 'App Developer': 2, 'Graphic Designer': 1, 'Project Manager': 1 },
};

/** How many projects one person can carry at full attention. Past this they are "shared" (work divided). */
export const PROJECTS_PER_PERSON: Record<string, number> = { 'Project Manager': 3, 'Graphic Designer': 2 };
export const capacityOf = (role: string) => PROJECTS_PER_PERSON[role] ?? 1;

/** Room each project role sits in (department names = office room names). */
export const DEPARTMENT: Record<string, string> = {
  'Web Developer': 'Engineering / IT', 'App Developer': 'Engineering / IT', 'Graphic Designer': 'Product', 'Project Manager': 'Projects & Operations',
};
export const departmentForRole = (role: string) => DEPARTMENT[role] ?? (/design/i.test(role) ? 'Product' : /manager|operations/i.test(role) ? 'Projects & Operations' : 'Engineering / IT');

/**
 * People a project needs: the type's template, +1 developer above ₹50k, +2 above ₹1.5L,
 * or the scope's own `team` ({ "Web Developer": 5 }) when the scoping step wrote one.
 */
export function teamNeeded(p: { projectType: string; quotedAmount?: number | null; scope?: any }): Record<string, number> {
  const custom = p.scope && typeof p.scope === 'object' ? p.scope.team : null;
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    const out: Record<string, number> = {};
    for (const [role, n] of Object.entries(custom)) {
      const count = Math.floor(Number(n));
      const title = String(role).replace(/[^\p{L}\p{N} &/-]/gu, '').trim().slice(0, 60);
      if (title && count > 0) out[title] = Math.min(count, 20);
    }
    if (Object.keys(out).length) return out;
  }
  const base = { ...(TEAM_TEMPLATES[p.projectType] ?? TEAM_TEMPLATES.WEBSITE) };
  const dev = p.projectType === 'APP' ? 'App Developer' : 'Web Developer';
  const amount = p.quotedAmount ?? 0;
  if (amount > 15_000_000) base[dev] = (base[dev] ?? 0) + 2;
  else if (amount > 5_000_000) base[dev] = (base[dev] ?? 0) + 1;
  return base;
}

export interface StaffPerson { id: string; load: number }
export type Pick = { kind: 'assign'; employeeId: string } | { kind: 'hire' } | { kind: 'share'; employeeId: string } | { kind: 'none' };

/**
 * One slot's decision (pure): an idle/under-capacity person first; else hire if the room has a free chair;
 * else split work with the least-loaded person (up to 2× capacity); else nobody.
 */
export function pickForSlot(people: StaffPerson[], cap: number, canHire: boolean): Pick {
  const sorted = [...people].sort((a, b) => a.load - b.load);
  const free = sorted.find((p) => p.load < cap);
  if (free) return { kind: 'assign', employeeId: free.id };
  if (canHire) return { kind: 'hire' };
  const sharable = sorted.find((p) => p.load < cap * 2);
  if (sharable) return { kind: 'share', employeeId: sharable.id };
  return { kind: 'none' };
}

/** Room full while projects still need people there. */
export function roomFullMessage(room: { name: string; chairs: number; used: number }, missing: Record<string, number>, projects: string[]) {
  const need = Object.entries(missing).map(([r, n]) => `${n} more ${r}${n === 1 ? '' : 's'}`).join(', ');
  const total = Object.values(missing).reduce((a, b) => a + b, 0);
  return `The ${titleRoom(room.name)} room is full: ${room.used} of ${room.chairs} chairs are taken.\n` +
    `Open projects still need ${need}. Until more chairs exist, the current team shares the work across: ${projects.slice(0, 5).join(', ')}.\n\n` +
    `Add at least ${total} desk${total === 1 ? '' : 's'} to ${titleRoom(room.name)} (or a new floor). The CEO hires automatically as soon as the office has free chairs.`;
}
const titleRoom = (n: string) => n.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bIt\b/, 'IT');

@Injectable()
export class ProjectStaffingService {
  private readonly logger = new Logger(ProjectStaffingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hiring: CeoHiringService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Business-loop step: release finished projects, staff open ones, alert on seat shortages. */
  async run(companyId: string) {
    const released = await this.releaseFinished(companyId);
    const ceo = await findCeo(this.prisma, companyId);
    if (!ceo) return { released, skipped: 'no CEO' };
    const unshared = await this.unshareWhenPossible(companyId);

    const projects = await this.prisma.clientProject.findMany({
      where: { companyId, status: { in: [...ACTIVE_PROJECT_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      include: { lead: { select: { name: true } } },
    });
    const actions: string[] = [];
    // room key → roles still missing (unfilled or shared slots) and the projects affected
    const shortRooms = new Map<string, { missing: Record<string, number>; projects: Set<string> }>();

    for (const p of projects) {
      const label = p.lead?.name ?? p.id.slice(0, 8);
      for (const [role, need] of Object.entries(teamNeeded(p))) {
        const onProject = await this.prisma.clientProjectStaff.findMany({ where: { projectId: p.id, roleTitle: role, releasedAt: null } });
        for (let slot = onProject.length; slot < need; slot++) {
          const r = await this.fillSlot(companyId, ceo.id, p.id, label, role, onProject.map((s) => s.employeeId));
          actions.push(r.detail);
          if (r.roomFull) {
            const sr = shortRooms.get(r.roomFull) ?? { missing: {}, projects: new Set<string>() };
            sr.missing[role] = (sr.missing[role] ?? 0) + (r.employeeId ? 1 : need - slot);
            sr.projects.add(label);
            shortRooms.set(r.roomFull, sr);
          }
          if (!r.employeeId) break;
          onProject.push({ employeeId: r.employeeId } as any);
        }
      }
    }

    if (shortRooms.size) {
      const states = await roomStates(this.prisma, companyId);
      for (const [key, sr] of shortRooms) await this.alertRoomFull(companyId, states.get(key)!, sr.missing, [...sr.projects]);
    }

    // --- NEW: Aevora internal product staffing for idle employees ---
    const activeStaff = await this.prisma.clientProjectStaff.findMany({ where: { companyId, releasedAt: null }, select: { employeeId: true } });
    const busy = new Set(activeStaff.map((a) => a.employeeId));
    
    const allEmployees = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: { role: true }
    });

    for (const emp of allEmployees) {
      if (!busy.has(emp.id) && !emp.role.title.toLowerCase().includes('ceo')) {
        const title = 'Improve Aevora internal product';
        const existingTask = await this.prisma.task.findFirst({
          where: {
            companyId,
            assignedEmployeeId: emp.id,
            title,
            status: { in: ['BACKLOG', 'READY', 'IN_PROGRESS'] }
          }
        });
        if (!existingTask) {
          await this.prisma.task.create({
            data: {
              companyId,
              title,
              description: 'You are idle, so you must start working on this Aevora project automatically to timely improve our own product. Research, design, and code improvements.',
              assignedEmployeeId: emp.id,
              priority: 'NORMAL',
              status: 'READY',
              createdBy: 'SYSTEM'
            }
          });
          actions.push(`Assigned ${emp.name} to internal Aevora project`);
        }
      }
    }
    // -----------------------------------------------------------------

    if (actions.length) this.logger.log(`[${companyId}] staffing: ${actions.join('; ')}`);
    return { released, unshared, actions };
  }

  private async fillSlot(companyId: string, ceoId: string, projectId: string, label: string, role: string, exclude: string[]) {
    const people = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE', id: { notIn: exclude }, role: { title: { equals: role, mode: 'insensitive' } } },
      select: { id: true, name: true },
    });
    const loads = await this.prisma.clientProjectStaff.groupBy({ by: ['employeeId'], where: { companyId, releasedAt: null, employeeId: { in: people.map((x) => x.id) } }, _count: true });
    const loadOf = new Map(loads.map((l) => [l.employeeId, l._count]));
    const dept = departmentForRole(role);
    const roomKey = roomKeyFor(dept);
    const room = roomKey ? (await roomStates(this.prisma, companyId)).get(roomKey) : null;
    const headcount = await this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } });
    const canHire = (room ? room.free > 0 : true) && headcount < hiringLimits().maxHeadcount;
    const pick = pickForSlot(people.map((x) => ({ id: x.id, load: loadOf.get(x.id) ?? 0 })), capacityOf(role), canHire);
    const nameOf = (id: string) => people.find((x) => x.id === id)?.name ?? id;
    const full = !canHire && roomKey ? roomKey : undefined; // room was the reason we couldn't hire

    if (pick.kind === 'assign' || pick.kind === 'share') {
      await this.prisma.clientProjectStaff.create({ data: { companyId, projectId, employeeId: pick.employeeId, roleTitle: role, shared: pick.kind === 'share' } });
      return { employeeId: pick.employeeId, shared: pick.kind === 'share', roomFull: pick.kind === 'share' ? full : undefined, detail: `${nameOf(pick.employeeId)} → ${label}${pick.kind === 'share' ? ' (shared)' : ''}` };
    }
    if (pick.kind === 'hire') {
      const h = await this.hiring.hire(companyId, ceoId, { role, department: dept, responsibilities: `Work on client projects as ${role}` }, `Project "${label}" needs a ${role} and nobody is free`, { project: label });
      if (h.outcome === 'EXECUTED') {
        await this.prisma.clientProjectStaff.create({ data: { companyId, projectId, employeeId: h.employeeId, roleTitle: role } });
        return { employeeId: h.employeeId, shared: false, roomFull: undefined, detail: `${h.detail} for ${label}` };
      }
      return { employeeId: null, shared: false, roomFull: h.roomFull, detail: `${role} for ${label}: ${h.detail}` };
    }
    return { employeeId: null, shared: false, roomFull: full, detail: `${role} for ${label}: ${full ? `${room?.name} room is full` : 'nobody available'} and everyone is at double load` };
  }

  /**
   * A shared slot (someone splitting work) is given back when it can now get its own person:
   * an idle person with that role exists, or their room has a free chair (the Chairman added desks).
   * The slot is then refilled by the normal loop.
   */
  private async unshareWhenPossible(companyId: string) {
    const shared = await this.prisma.clientProjectStaff.findMany({ where: { companyId, releasedAt: null, shared: true }, orderBy: { assignedAt: 'asc' } });
    if (!shared.length) return 0;
    const rooms = await roomStates(this.prisma, companyId);
    const freeLeft = new Map([...rooms].map(([k, r]) => [k, r.free]));
    let count = 0;
    for (const a of shared) {
      const idle = await this.prisma.employee.count({
        where: { companyId, status: 'ACTIVE', role: { title: { equals: a.roleTitle, mode: 'insensitive' } }, id: { not: a.employeeId }, NOT: { id: { in: (await this.prisma.clientProjectStaff.findMany({ where: { companyId, releasedAt: null }, select: { employeeId: true } })).map((x) => x.employeeId) } } },
      });
      const key = roomKeyFor(departmentForRole(a.roleTitle));
      const free = key ? freeLeft.get(key) ?? 0 : 0;
      if (idle > 0 || free > 0) {
        if (!idle && key) freeLeft.set(key, free - 1);
        await this.prisma.clientProjectStaff.update({ where: { id: a.id }, data: { releasedAt: new Date() } });
        count++;
      }
    }
    return count;
  }

  /** People on finished projects (or who left) go back to the pool. */
  private async releaseFinished(companyId: string) {
    const done = await this.prisma.clientProject.findMany({ where: { companyId, status: { in: [...DONE_PROJECT_STATUSES] } }, select: { id: true } });
    const gone = await this.prisma.employee.findMany({ where: { companyId, status: { not: 'ACTIVE' } }, select: { id: true } });
    const r = await this.prisma.clientProjectStaff.updateMany({
      where: { companyId, releasedAt: null, OR: [{ projectId: { in: done.map((d) => d.id) } }, { employeeId: { in: gone.map((g) => g.id) } }] },
      data: { releasedAt: new Date() },
    });
    return r.count;
  }

  /** Tell the Chairman (Assistant chat + email), at most once a day per room and shortfall. */
  private async alertRoomFull(companyId: string, room: RoomState, missing: Record<string, number>, projects: string[]) {
    const total = Object.values(missing).reduce((x, y) => x + y, 0);
    const key = `roomfull:${room.key}:${room.chairs}:${total}`;
    const recent = await this.prisma.chairmanAlert.findFirst({ where: { companyId, key, createdAt: { gte: new Date(Date.now() - DAY) } } });
    if (recent) return;
    const message = roomFullMessage(room, missing, projects);
    const subject = `${titleRoom(room.name)} room is full — add ${total} desk${total === 1 ? '' : 's'}`;
    await this.prisma.chairmanAlert.create({ data: { companyId, key, subject, body: message, emailedAt: new Date() } });
    await this.prisma.assistantMessage.create({ data: { companyId, from: 'ASSISTANT', to: 'CHAIRMAN', content: `⚠️ ${message}`, status: 'DONE' } });
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    this.realtime.broadcastToUser(company.chairmanId, 'staffing.room_full', { room: titleRoom(room.name), roomKey: room.key, chairs: room.chairs, used: room.used, missing, projects, subject, message });
    this.logger.warn(`[${companyId}] ${message.split('\n')[0]}`);
  }

  /** For the Assistant's team report: rooms (chairs, used), busy/idle people, open-project demand. */
  async overview(companyId: string) {
    const [people, active, projects, rooms] = await Promise.all([
      this.prisma.employee.findMany({ where: { companyId, status: 'ACTIVE' }, select: { id: true } }),
      this.prisma.clientProjectStaff.findMany({ where: { companyId, releasedAt: null }, select: { employeeId: true, shared: true } }),
      this.prisma.clientProject.findMany({ where: { companyId, status: { in: [...ACTIVE_PROJECT_STATUSES] } }, select: { projectType: true, quotedAmount: true, scope: true } }),
      roomStates(this.prisma, companyId),
    ]);
    const busy = new Set(active.map((a) => a.employeeId));
    const need: Record<string, number> = {};
    for (const p of projects) for (const [r, n] of Object.entries(teamNeeded(p))) need[r] = (need[r] ?? 0) + n;
    return {
      openProjects: projects.length,
      sharedAssignments: active.filter((a) => a.shared).length,
      busy: people.filter((p) => busy.has(p.id)).length,
      idle: people.filter((p) => !busy.has(p.id)).length,
      projectNeeds: need,
      rooms: [...rooms.values()].filter((r) => r.used > 0 || r.reported).map((r) => ({ room: titleRoom(r.name), chairs: r.chairs, used: r.used, free: r.free, reported: r.reported })),
    };
  }
}
