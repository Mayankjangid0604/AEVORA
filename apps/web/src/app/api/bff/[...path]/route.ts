import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { projections, type Projection } from '@/server/projections';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';

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
  { pattern: /^chairman\/(overview|alerts|decisions|activity)$/, company: true },
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
