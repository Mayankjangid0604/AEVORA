import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from '@/server/api';
import { isSameOrigin } from '@/server/origin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

/**
 * Public onboarding: registers a fresh company and authorized administrator.
 * Sets the authenticated session cookie directly so the user is immediately signed in.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Cross-origin request rejected' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    adminName?: unknown;
    adminEmail?: unknown;
    password?: unknown;
    companyName?: unknown;
    legalName?: unknown;
    description?: unknown;
  } | null;

  const adminName = typeof body?.adminName === 'string' ? body.adminName.trim() : '';
  const adminEmail = typeof body?.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : '';
  const legalName = typeof body?.legalName === 'string' && body.legalName.trim() ? body.legalName.trim() : undefined;
  const description = typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : undefined;

  if (!adminName || !adminEmail || !password || !companyName) {
    return NextResponse.json({ message: 'Administrator name, email, password, and company name are required.' }, { status: 400 });
  }

  const r = await backendFetch<{ access_token?: string; company?: { id: string } }>('auth/register-company', {
    method: 'POST',
    body: { adminName, adminEmail, password, companyName, legalName, description },
    token: null,
    signal: req.signal,
  });

  if (!r.ok) {
    return NextResponse.json({ message: r.error.message }, { status: r.status });
  }
  if (typeof r.data?.access_token !== 'string' || !r.data?.company?.id) {
    return NextResponse.json({ message: 'Unexpected registration response from backend.' }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true, companyId: r.data.company.id });
  res.cookies.set(SESSION_COOKIE, r.data.access_token, sessionCookieOptions());
  return res;
}
