import {
  House, Robot, Lightbulb, CheckSquare, Bell,
  Play, TrendUp, Funnel, Package, Headset, MegaphoneSimple,
  EnvelopeSimple, CurrencyDollar, Heartbeat, Users,
  Rows, FolderOpen, Rocket, MapPin, ChatCircle, BookOpen,
  Flask, ClockCounterClockwise, Pulse, Cpu, TreeStructure, Coins, Brain,
  Globe, Wrench, Briefcase, Cube, Factory, ArrowsClockwise, Target, UsersThree, NotePencil, Microphone, Notebook,
  Buildings, ChartLine, type Icon,
} from '@phosphor-icons/react';

/** badge: true = Inbox unread replies; a string = API path returning { count } for that app's badge. */
export interface OsApp { href: string; label: string; icon: Icon; badge?: boolean | string }

/** OfficeOS desktop. First four groups mirror the old Sidebar NAV; "More" holds routes the sidebar never listed. */
export const OS_APPS: { section: string; items: OsApp[] }[] = [
  {
    section: 'Command',
    items: [
      { href: '/overview', label: 'Overview', icon: House },
      { href: '/ceo', label: 'CEO OS', icon: Briefcase },
      { href: '/assistant', label: 'Assistant', icon: Robot },
      { href: '/chairman-mail', label: 'Chairman Mail', icon: EnvelopeSimple, badge: '/chairman-mail/unread-count' },
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/decisions', label: 'Decisions', icon: CheckSquare },
      { href: '/alerts', label: 'Alerts', icon: Bell },
      { href: '/simulation', label: 'Simulation', icon: Play },
      { href: '/replay', label: 'Replay', icon: ClockCounterClockwise },
      { href: '/notes', label: 'Sticky notes', icon: NotePencil },
      { href: '/diary', label: 'Voice diary', icon: Microphone },
      { href: '/minutes', label: 'Minutes', icon: Notebook },
      { href: '/boardroom', label: 'Boardroom', icon: UsersThree },
    ],
  },
  {
    section: 'Revenue',
    items: [
      { href: '/sales', label: 'Sales & BD', icon: TrendUp },
      { href: '/acquisition', label: 'Acquisition', icon: Funnel },
      { href: '/delivery', label: 'Delivery', icon: Package },
      { href: '/customer-operations', label: 'Customer Ops', icon: Headset },
      { href: '/marketing', label: 'Marketing', icon: MegaphoneSimple },
      { href: '/inbox', label: 'Inbox', icon: EnvelopeSimple, badge: true },
    ],
  },
  {
    section: 'Money',
    items: [
      { href: '/financials', label: 'Financials', icon: CurrencyDollar },
      { href: '/survival', label: 'Survival', icon: Heartbeat },
      { href: '/capital-allocation', label: 'Capital Allocation', icon: Coins },
    ],
  },
  {
    section: 'Company',
    items: [
      { href: '/employees', label: 'Employees', icon: Users },
      { href: '/departments', label: 'Departments', icon: Rows },
      { href: '/projects', label: 'Projects', icon: FolderOpen },
      { href: '/ventures', label: 'Ventures', icon: Rocket },
      { href: '/world-map', label: 'World Map', icon: MapPin },
      { href: '/communication', label: 'Communication', icon: ChatCircle },
      { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
      { href: '/research', label: 'AI Lab', icon: Flask },
    ],
  },
  {
    section: 'More',
    items: [
      { href: '/activity', label: 'Activity', icon: Pulse },
      { href: '/management', label: 'Management', icon: Briefcase },
      { href: '/workforce', label: 'Workforce', icon: UsersThree },
      { href: '/business-units', label: 'Business Units', icon: TreeStructure },
      { href: '/strategy', label: 'Strategy', icon: Target },
      { href: '/global-operations', label: 'Global Ops', icon: Globe },
      { href: '/autonomous-enterprise', label: 'Autonomous Ent.', icon: Cpu },
      { href: '/product-factory', label: 'Product Factory', icon: Factory },
      { href: '/rd-flywheel', label: 'R&D Flywheel', icon: ArrowsClockwise },
      { href: '/lab', label: 'Lab', icon: Wrench },
      { href: '/foundation-intelligence', label: 'Foundation AI', icon: Brain },
      { href: '/model-platform', label: 'Model Platform', icon: Cube },
      { href: '/research/models', label: 'Models', icon: ChartLine },
      { href: '/research/improvement', label: 'Improvement', icon: ChartLine },
      { href: '/world-classic', label: 'World (Classic)', icon: Buildings },
      { href: '/world-pixi', label: 'World (Pixel)', icon: Buildings },
    ],
  },
];

const ALL = OS_APPS.flatMap((g) => g.items);
/** App owning a pathname: exact match or a sub-path ('/projects/abc' → Projects). */
export const appFor = (path: string) =>
  ALL.filter((a) => path === a.href || path.startsWith(`${a.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
