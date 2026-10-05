import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';

/**
 * Browser -> BFF read proxy. Only explicitly verified, isolation-safe GET routes are reachable.
 * Adding a route here requires verifying that its backend controller scopes by the authenticated actor.
 */
const ALLOWED: RegExp[] = [
  /^auth\/(me|companies|capabilities)$/,
  /^groups$/,
  /^groups\/[A-Za-z0-9_-]{1,64}$/,
  /^companies\/[A-Za-z0-9_-]{1,64}$/,
  // Slice 2: Chairman Home reads (ChairmanController, CHAIRMAN-only, scoped by getCompanyForChairman).
  /^chairman\/(overview|alerts|decisions|activity)$/,
];

/**
 * Routes whose backend falls back to the Chairman's *first* company when X-Company-Id is absent.
 * The BFF refuses them without an explicit company so that fallback can never happen.
 */
const REQUIRES_COMPANY = /^chairman\//;

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const path = (await ctx.params).path.join('/');
  if (!ALLOWED.some((r) => r.test(path))) return NextResponse.json({ message: 'Not available' }, { status: 404 });

  const companyId = req.headers.get(COMPANY_HEADER) ?? undefined;
  if (companyId !== undefined && !isSafeId(companyId)) return NextResponse.json({ message: 'Invalid company context' }, { status: 400 });
  if (companyId === undefined && REQUIRES_COMPANY.test(path)) return NextResponse.json({ message: 'Company context required' }, { status: 400 });

  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });

  const r = await backendFetch<unknown>(`${path}${req.nextUrl.search}`, { companyId, token, signal: req.signal });
  const res = NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
  if (r.status === 401) res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
