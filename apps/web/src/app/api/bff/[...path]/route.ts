import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { projections, type Projection } from '@/server/projections';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';
import { isSameOrigin } from '@/server/origin';

/**
 * Browser -> BFF read proxy. Only explicitly verified, isolation-safe GET routes are reachable.
 * Adding a route requires verifying that its backend controller scopes by the authenticated actor.
 *
 * company: the backend resolves company from the token and falls back to the Chairman's *first* company when
 *          X-Company-Id is absent, so the BFF refuses these routes without an explicit company.
 * project: server-side field whitelist; anything else the backend returns never reaches the browser.
 */
interface RouteRule {
  pattern: RegExp;
  company?: true;
  project?: Projection;
  /** The first capture group is a company id in the path; it must equal the explicit company header. */
  pathCompany?: true;
}

const ID = '[A-Za-z0-9_-]{1,64}';
const ROUTES: RouteRule[] = [
  { pattern: /^auth\/(me|companies|capabilities)$/ },
  { pattern: /^groups$/ },
  { pattern: new RegExp(`^groups/${ID}$`) },
  { pattern: new RegExp(`^companies/${ID}$`) },
  // Slice 2: Chairman Home (ChairmanController, CHAIRMAN-only, getCompanyForChairman).
  { pattern: /^chairman\/(overview|activity)$/, company: true },
  { pattern: /^chairman\/alerts$/, company: true, project: projections.alerts },
  { pattern: /^chairman\/decisions$/, company: true, project: projections.decisions },
  // Slice 7: AI CEO read-only records. ceo/ask, reviews/run, questions/:id/answer etc. stay blocked (model calls / mutations).
  { pattern: /^ceo\/feed$/, company: true, project: projections.ceoFeed },
  { pattern: /^ceo\/questions$/, company: true, project: projections.ceoQuestions },
  // Slice 8: Marketing content posts and lead generation (read-only). generate/approve/posted/whatsapp/pixel,
  // lead-gen/trigger, sales/*, outreach/*, inbox/*, client-meeting/* and research/* stay blocked.
  { pattern: /^marketing-content\/posts$/, company: true, project: projections.contentPosts },
  { pattern: /^lead-gen\/runs$/, company: true, project: projections.leadGenRuns },
  { pattern: /^lead-gen\/leads$/, company: true, project: projections.salesLeads },
  // Slice 9: Operating-loop cycles (rule-based OODA records), read-only. :companyId/cycle, verdict, scan-opportunities,
  // error-pool/*, context, memory, performance and all continuous-improvement/autonomous-enterprise/boardroom routes stay blocked.
  { pattern: new RegExp(`^operating-loop/(${ID})/cycles$`), company: true, pathCompany: true, project: projections.operatingCycles },
  { pattern: new RegExp(`^operating-loop/cycle/${ID}$`), company: true, project: projections.operatingCycle },
  // Slice 10: Assistant history, Chairman mail list + unread count, agent roster (all read-only).
  // assistant/message (model + actions), chairman-mail/:id (marks read), replies, agents/:id/run etc. stay blocked.
  { pattern: /^assistant\/messages$/, company: true, project: projections.assistantMessages },
  { pattern: /^chairman-mail$/, company: true, project: projections.chairmanMail },
  { pattern: /^chairman-mail\/unread-count$/, company: true, project: projections.unreadCount },
  { pattern: /^agents$/, company: true, project: projections.agents },
  // Slice 3: Organization / Workforce (req.user.companyId; by-id reads company-bound, see AEVORA_V14_SLICE3_REPORT.md).
  { pattern: /^organization\/departments$/, company: true, project: projections.departments },
  { pattern: new RegExp(`^organization/departments/${ID}$`), company: true, project: projections.department },
  { pattern: /^organization\/employees$/, company: true, project: projections.employees },
  { pattern: new RegExp(`^organization/employee/${ID}$`), company: true, project: projections.employee },
  { pattern: /^workforce\/profiles$/, company: true, project: projections.provenanceList },
  { pattern: new RegExp(`^workforce/profiles/${ID}$`), company: true, project: projections.provenance },
  // Slice 4: Projects (ChairmanController, CHAIRMAN-only, getCompanyForChairman; detail 404s foreign ids).
  { pattern: /^chairman\/projects$/, company: true, project: projections.projects },
  { pattern: new RegExp(`^chairman/projects/${ID}$`), company: true, project: projections.project },
  // Slice 5: Intelligence. company-intelligence is computed from DB state on request (no model/external call);
  // proposals/assistance/session are persisted rows. Backend checks req.user.companyId === path company.
  { pattern: new RegExp(`^company-intelligence/company/(${ID})$`), company: true, pathCompany: true, project: projections.intelligenceSummary },
  { pattern: new RegExp(`^intelligence/company/(${ID})/proposals$`), company: true, pathCompany: true, project: projections.proposals },
  { pattern: new RegExp(`^intelligence/company/(${ID})/assistance-requests$`), company: true, pathCompany: true, project: projections.assistanceRequests },
  { pattern: new RegExp(`^intelligence/sessions/${ID}$`), company: true, project: projections.session },
  // Slice 6: Tasks by assignee (TaskController; employee/task company-bound since Slice 1; projection also keeps
  // only rows whose companyId equals the selected company). There is no company-wide task listing endpoint.
  { pattern: new RegExp(`^employees/${ID}/tasks$`), company: true, project: projections.employeeTasks },
  { pattern: new RegExp(`^tasks/${ID}$`), company: true, project: projections.task },
  // V24 Offer Market: Governed offer listing, details, measurement, and optimization
  { pattern: /^offers$/, company: true, project: projections.offers },
  { pattern: new RegExp(`^offers/${ID}$`), company: true, project: projections.offer },
  { pattern: new RegExp(`^offers/${ID}/measurement$`), company: true, project: projections.offerMeasurement },
  { pattern: new RegExp(`^offers/${ID}/optimization$`), company: true, project: projections.offerOptimization },
  // Gate 4A: request queue + job controls (InquiryController / JobController: tenant = req.user.companyId, foreign ids 404).
  { pattern: /^inquiries$/, company: true, project: projections.inquiries },
  { pattern: new RegExp(`^inquiries/${ID}$`), company: true, project: projections.inquiry },
  { pattern: /^job$/, company: true, project: projections.jobs },
  { pattern: new RegExp(`^job/${ID}$`), company: true, project: projections.job },
];

/**
 * State-changing routes reachable from the browser. Same-origin only, explicit company, JSON body re-built from
 * known fields (nothing else is forwarded). The backend enforces role + tenant on each.
 */
const MUTATIONS: { pattern: RegExp; fields: string[]; project: Projection }[] = [
  { pattern: new RegExp(`^inquiries/${ID}/transition$`), fields: ['from', 'to'], project: projections.inquiry },
  { pattern: new RegExp(`^inquiries/${ID}/notes$`), fields: ['note'], project: projections.inquiry },
  { pattern: new RegExp(`^job/${ID}/(pause|resume|replay)$`), fields: [], project: projections.job },
];

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const path = (await ctx.params).path.join('/');
  const rule = ROUTES.find((r) => r.pattern.test(path));
  if (!rule) return NextResponse.json({ message: 'Not available' }, { status: 404 });

  const companyId = req.headers.get(COMPANY_HEADER) ?? undefined;
  if (companyId !== undefined && !isSafeId(companyId)) return NextResponse.json({ message: 'Invalid company context' }, { status: 400 });
  if (companyId === undefined && rule.company) return NextResponse.json({ message: 'Company context required' }, { status: 400 });
  if (rule.pathCompany && rule.pattern.exec(path)?.[1] !== companyId) return NextResponse.json({ message: 'Company context mismatch' }, { status: 400 });

  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });

  // Query strings are not forwarded: no consumer needs them, and allowlisted paths stay exact.
  const r = await backendFetch<unknown>(path, { companyId, token, signal: req.signal });
  let res: NextResponse;
  if (!r.ok) {
    res = NextResponse.json(r.error, { status: r.status, headers: noStore });
  } else {
    const body = rule.project ? rule.project(r.data, companyId) : r.data;
    res = body === undefined
      ? NextResponse.json({ status: 404, kind: 'not_found', message: 'Not found' }, { status: 404, headers: noStore })
      : NextResponse.json(body, { status: r.status, headers: noStore });
  }
  if (r.status === 401) res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const path = (await ctx.params).path.join('/');
  const rule = MUTATIONS.find((r) => r.pattern.test(path));
  if (!rule) return NextResponse.json({ message: 'Not available' }, { status: 404 });

  const companyId = req.headers.get(COMPANY_HEADER) ?? undefined;
  if (!companyId || !isSafeId(companyId)) return NextResponse.json({ message: 'Company context required' }, { status: 400 });
  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const body = Object.fromEntries(rule.fields.filter((k) => typeof raw?.[k] === 'string').map((k) => [k, (raw[k] as string).slice(0, 2000)]));
  const r = await backendFetch<unknown>(path, { method: 'POST', body, companyId, token, signal: req.signal });
  const res = r.ok
    ? NextResponse.json(rule.project(r.data, companyId) ?? { message: 'Not found' }, { status: r.status, headers: noStore })
    : NextResponse.json(r.error, { status: r.status, headers: noStore });
  if (r.status === 401) res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
