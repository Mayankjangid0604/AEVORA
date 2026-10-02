import { PrismaService } from '../prisma/prisma.service';

/**
 * Work rooms of the 3D office (public/office/Aevora_Office_3D_v3.html ROOMS) → the department name used for hires.
 * Hiring into these names makes the office seat people in the right room automatically.
 */
export const OFFICE_ROOMS: Record<string, string> = {
  ENGINEERING_IT: 'Engineering / IT',
  SALES: 'Sales',
  CUSTOMER_SUPPORT: 'Customer Support',
  FINANCE: 'Finance',
  LEGAL_COMPLIANCE: 'Legal & Compliance',
  RESEARCH_DEVELOPMENT: 'Research & Development',
  PRODUCT: 'Product',
  MARKETING: 'Marketing',
  HUMAN_RESOURCES: 'Human Resources',
  PROJECTS_OPERATIONS: 'Projects & Operations',
  DATA_ANALYTICS: 'Data & Analytics',
  STRATEGY_PLANNING: 'Strategy & Planning',
  BOARD_ROOM: 'Board Room',
};

/** Other department names people (or the model) use → room key. */
const ALIASES: Record<string, string> = {
  ENGINEERING: 'ENGINEERING_IT', IT: 'ENGINEERING_IT', DEVELOPMENT: 'ENGINEERING_IT', TECH: 'ENGINEERING_IT', TECHNOLOGY: 'ENGINEERING_IT',
  DESIGN: 'PRODUCT', UX: 'PRODUCT', UI_UX: 'PRODUCT',
  OPERATIONS: 'PROJECTS_OPERATIONS', PROJECTS: 'PROJECTS_OPERATIONS', DELIVERY: 'PROJECTS_OPERATIONS', MANAGEMENT: 'PROJECTS_OPERATIONS',
  SUPPORT: 'CUSTOMER_SUPPORT', CUSTOMER_SERVICE: 'CUSTOMER_SUPPORT', CUSTOMER_SUCCESS: 'CUSTOMER_SUPPORT',
  HR: 'HUMAN_RESOURCES', PEOPLE: 'HUMAN_RESOURCES', RECRUITMENT: 'HUMAN_RESOURCES',
  LEGAL: 'LEGAL_COMPLIANCE', COMPLIANCE: 'LEGAL_COMPLIANCE',
  RESEARCH: 'RESEARCH_DEVELOPMENT', R_D: 'RESEARCH_DEVELOPMENT', RND: 'RESEARCH_DEVELOPMENT',
  DATA: 'DATA_ANALYTICS', ANALYTICS: 'DATA_ANALYTICS',
  STRATEGY: 'STRATEGY_PLANNING', NEW_VENTURES: 'STRATEGY_PLANNING', PLANNING: 'STRATEGY_PLANNING',
  EXECUTIVE: 'BOARD_ROOM', ACCOUNTS: 'FINANCE', ACCOUNTING: 'FINANCE', BUSINESS_DEVELOPMENT: 'SALES',
};

/** Same rule as the office's zoneKey(). */
export const zoneKey = (n: string) => n.toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');

/** Department name → office room key (null = not a work room, e.g. the CEO's own office). */
export function roomKeyFor(department: string | null | undefined): string | null {
  if (!department) return null;
  const k = zoneKey(department);
  if (OFFICE_ROOMS[k]) return k;
  if (ALIASES[k]) return ALIASES[k];
  const first = ALIASES[k.split('_')[0]];
  return first ?? null;
}

/** Department name → the canonical room name to hire into (unknown names pass through unchanged). */
export function canonicalDepartment(department: string): string {
  const k = roomKeyFor(department);
  return k ? OFFICE_ROOMS[k] : department;
}

/** Chairs when the office hasn't reported yet (first run before anyone opened the 3D office). */
export const defaultChairs = () => Math.max(1, Number(process.env.DEFAULT_ROOM_CHAIRS ?? process.env.DEFAULT_ROLE_SEATS ?? 6) || 6);

export interface RoomState { key: string; name: string; chairs: number; used: number; free: number; reported: boolean }

/** Chairs and people per room. CEO is excluded (own office). */
export async function roomStates(prisma: PrismaService, companyId: string): Promise<Map<string, RoomState>> {
  const [rooms, people] = await Promise.all([
    prisma.officeRoom.findMany({ where: { companyId } }),
    prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { department: { select: { name: true } }, role: { select: { title: true } } },
    }),
  ]);
  const out = new Map<string, RoomState>();
  for (const [key, name] of Object.entries(OFFICE_ROOMS)) {
    const r = rooms.find((x) => x.key === key);
    const chairs = r?.chairs ?? defaultChairs();
    out.set(key, { key, name: r?.name ?? name.toUpperCase(), chairs, used: 0, free: chairs, reported: !!r });
  }
  for (const p of people) {
    if (/\b(ceo|chief executive)\b/i.test(p.role?.title ?? '')) continue;
    const k = roomKeyFor(p.department?.name);
    const s = k ? out.get(k) : null;
    if (s) { s.used++; s.free = Math.max(0, s.chairs - s.used); }
  }
  return out;
}

/** Free chairs in the room a department sits in (Infinity for departments outside the work rooms). */
export async function freeChairsFor(prisma: PrismaService, companyId: string, department: string) {
  const k = roomKeyFor(department);
  if (!k) return { key: null, free: Infinity, state: null as RoomState | null };
  const state = (await roomStates(prisma, companyId)).get(k)!;
  return { key: k, free: state.free, state };
}

/** Office → API: chair counts per room (called when the 3D office loads). Rooms not in OFFICE_ROOMS are ignored. */
export async function saveOfficeRooms(prisma: PrismaService, companyId: string, rooms: { key: string; name: string; chairs: number }[]) {
  let saved = 0;
  for (const r of rooms ?? []) {
    const key = zoneKey(String(r?.key ?? ''));
    const chairs = Math.floor(Number(r?.chairs));
    if (!OFFICE_ROOMS[key] || !Number.isFinite(chairs) || chairs < 0 || chairs > 500) continue;
    const name = String(r.name ?? OFFICE_ROOMS[key]).slice(0, 60);
    await prisma.officeRoom.upsert({
      where: { companyId_key: { companyId, key } },
      update: { chairs, name },
      create: { companyId, key, name, chairs },
    });
    saved++;
  }
  return { saved };
}
