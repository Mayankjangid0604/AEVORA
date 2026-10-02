export interface Floor {
  id: string;
  level: number; // 0 = ground, 1, 2, 3 = top
  name: string;
}

export interface Department {
  id: string;
  name: string;
  subtitle: string;
  floorLevel: number;
  position: 'left' | 'center-left' | 'center' | 'center-right' | 'right';
  color: string;        // room accent color
  bgColor: string;      // room background
  screenColor: string;  // display screen color
  employeeRoles: string[]; // which roles sit here
  icon: string;         // single character icon for the screen
}

export const DEPARTMENTS: Department[] = [
  // Ground floor
  { id: 'reception', name: 'Reception', subtitle: 'Welcome · Visitors · Security', floorLevel: 0, position: 'center', color: '#6366F1', bgColor: '#0F0F1A', screenColor: '#6366F1', employeeRoles: [], icon: 'A' },
  { id: 'cafeteria', name: 'Cafeteria', subtitle: 'Food · Relax · Connect', floorLevel: 0, position: 'center-left', color: '#F59E0B', bgColor: '#1A120F', screenColor: '#F59E0B', employeeRoles: [], icon: '☕' },
  { id: 'legal', name: 'Legal & Compliance', subtitle: 'Policies · Risk · Governance', floorLevel: 0, position: 'left', color: '#8B5CF6', bgColor: '#0F0A1A', screenColor: '#8B5CF6', employeeRoles: [], icon: '⚖' },
  { id: 'finance', name: 'Finance', subtitle: 'Revenue · Budget · Operations', floorLevel: 0, position: 'center-left', color: '#10B981', bgColor: '#0A1A0F', screenColor: '#10B981', employeeRoles: ['Chief Financial Officer'], icon: '$' },
  { id: 'projects', name: 'Projects & Operations', subtitle: 'Delivery · Execution · Results', floorLevel: 0, position: 'center-right', color: '#3B82F6', bgColor: '#0A0F1A', screenColor: '#3B82F6', employeeRoles: ['Project Manager', 'Operations Manager'], icon: '◈' },
  { id: 'analytics', name: 'Data & Analytics', subtitle: 'Insights · Reports · Intelligence', floorLevel: 0, position: 'right', color: '#06B6D4', bgColor: '#0A1A1A', screenColor: '#06B6D4', employeeRoles: [], icon: '▣' },

  // Floor 2
  { id: 'support', name: 'Customer Support', subtitle: 'Customers · Satisfaction · Success', floorLevel: 1, position: 'left', color: '#F97316', bgColor: '#1A0F0A', screenColor: '#F97316', employeeRoles: ['Customer Support Agent', 'CRM Specialist'], icon: '◎' },
  { id: 'sales', name: 'Sales', subtitle: 'Leads · Proposals · Revenue', floorLevel: 1, position: 'center-left', color: '#10B981', bgColor: '#0A1A0F', screenColor: '#10B981', employeeRoles: ['Sales Representative', 'Sales Manager', 'Business Development Executive'], icon: '▲' },
  { id: 'engineering', name: 'Engineering / IT', subtitle: 'Development · Infrastructure · Systems', floorLevel: 1, position: 'center-right', color: '#3B82F6', bgColor: '#0A0F1A', screenColor: '#3B82F6', employeeRoles: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'DevOps Engineer', 'Development Manager'], icon: '</>' },
  { id: 'product', name: 'Product', subtitle: 'Ideas · Design · User Experience', floorLevel: 1, position: 'center-right', color: '#EC4899', bgColor: '#1A0A0F', screenColor: '#EC4899', employeeRoles: ['Product Manager', 'Business Analyst', 'Venture Lead'], icon: '◆' },
  { id: 'marketing', name: 'Marketing', subtitle: 'Brand · Content · Market Growth', floorLevel: 1, position: 'right', color: '#F59E0B', bgColor: '#1A120A', screenColor: '#F59E0B', employeeRoles: ['Content Creator', 'Social Media Manager', 'Marketing Manager', 'SEO Specialist'], icon: '◉' },
  { id: 'hr', name: 'Human Resources', subtitle: 'Hiring · Training · People Growth', floorLevel: 1, position: 'right', color: '#A78BFA', bgColor: '#100A1A', screenColor: '#A78BFA', employeeRoles: ['HR Manager'], icon: '◎' },

  // Floor 3
  { id: 'rd', name: 'Research & Development', subtitle: 'AI Models · Innovation · Future Tech', floorLevel: 2, position: 'left', color: '#818CF8', bgColor: '#0A0A1A', screenColor: '#818CF8', employeeRoles: [], icon: '◈' },
  { id: 'strategy', name: 'Strategy & Planning', subtitle: 'Insights · Analysis · Business Growth', floorLevel: 2, position: 'right', color: '#34D399', bgColor: '#0A1A10', screenColor: '#34D399', employeeRoles: [], icon: '⬡' },
  { id: 'ceo', name: 'CEO', subtitle: 'Vision · Strategy · Execution', floorLevel: 2, position: 'center', color: '#6366F1', bgColor: '#0A0A14', screenColor: '#6366F1', employeeRoles: ['Chief Executive Officer'], icon: '★' },

  // Top floor
  { id: 'chairman', name: 'Chairman Office', subtitle: 'Executive Command Center', floorLevel: 3, position: 'center', color: '#6366F1', bgColor: '#080814', screenColor: '#6366F1', employeeRoles: [], icon: '⬟' },
  { id: 'boardroom', name: 'Board Room', subtitle: 'Strategy · Decisions · Alignment', floorLevel: 3, position: 'left', color: '#A78BFA', bgColor: '#0A0814', screenColor: '#A78BFA', employeeRoles: [], icon: '▣' },
  { id: 'executive-lounge', name: 'Executive Lounge', subtitle: 'Leadership · Networking · Relax', floorLevel: 3, position: 'right', color: '#F59E0B', bgColor: '#14100A', screenColor: '#F59E0B', employeeRoles: [], icon: '◇' },
];

export const FLOOR_NAMES = [
  'Ground Floor',
  'Operations Floor',
  'Executive Floor',
  'Command Floor',
];

/** Rooms on a floor in left → right order. */
export const POSITION_ORDER: Department['position'][] = ['left', 'center-left', 'center', 'center-right', 'right'];

export function roomsOnFloor(level: number): Department[] {
  const rooms = DEPARTMENTS.filter((d) => d.floorLevel === level);
  return POSITION_ORDER.flatMap((p) => rooms.filter((r) => r.position === p));
}

/** Employee as returned by GET /chairman/world. */
export interface WorldEmployee {
  id: string;
  name: string;
  role: string | null;
  departmentName: string | null;
  status: string;
  activity: string;
  locationId?: string | null;
  locationName?: string | null;
  locationType?: string | null;
  currentTaskTitle: string | null;
  hireDate?: string;
}

const DEPT_COLORS: Record<string, string> = {
  Executive: '#6366F1',
  Sales: '#10B981',
  Development: '#3B82F6',
  Marketing: '#F59E0B',
  Management: '#8B5CF6',
  'New Ventures': '#EF4444',
  'Customer Support': '#F97316',
  'Human Resources': '#A78BFA',
};

/** Fallback room for employees whose role title matches no room's role list. */
const ROOM_FOR_DEPARTMENT: Record<string, string> = {
  Executive: 'ceo',
  Sales: 'sales',
  Development: 'engineering',
  Marketing: 'marketing',
  Management: 'projects',
  'New Ventures': 'product',
  'Customer Support': 'support',
  'Human Resources': 'hr',
  Finance: 'finance',
};

export function getEmployeeColor(dept: string | null): string {
  if (!dept) return '#6366F1';
  return DEPT_COLORS[dept] ?? (dept.startsWith('Venture') ? DEPT_COLORS['New Ventures'] : '#6366F1');
}

export const isCeo = (e: WorldEmployee) => /\b(ceo|chief executive)\b/i.test(e.role ?? '');

/** Each employee lands in exactly one room: CEO → CEO office, then role match, then department fallback. */
export function roomIdFor(e: WorldEmployee): string | null {
  if (isCeo(e)) return 'ceo';
  const role = (e.role ?? '').toLowerCase();
  if (role) {
    const hit = DEPARTMENTS.find((d) => d.employeeRoles.some((r) => role.includes(r.toLowerCase()) || r.toLowerCase().includes(role)));
    if (hit) return hit.id;
  }
  if (e.locationType === 'DEPARTMENT' && e.departmentName) {
    const hit = DEPARTMENTS.find(d => d.name === e.departmentName);
    if (hit) return hit.id;
  }
  
  const dept = e.departmentName ?? '';
  return ROOM_FOR_DEPARTMENT[dept] ?? (dept.startsWith('Venture') ? 'product' : null);
}

/** Employees per room id (sorted by name), plus those that match no room. */
export function groupByRoom(employees: WorldEmployee[]): { byRoom: Map<string, WorldEmployee[]>; unplaced: WorldEmployee[] } {
  const byRoom = new Map<string, WorldEmployee[]>();
  const unplaced: WorldEmployee[] = [];
  for (const e of [...employees].sort((a, b) => a.name.localeCompare(b.name))) {
    const id = roomIdFor(e);
    if (id) byRoom.set(id, [...(byRoom.get(id) ?? []), e]);
    else unplaced.push(e);
  }
  return { byRoom, unplaced };
}
