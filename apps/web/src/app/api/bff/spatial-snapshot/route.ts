import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';

/**
 * Dedicated BFF route for authorized client-side spatial snapshot loading/reconciliation.
 * Reads the httpOnly session cookie and forwards with verified x-company-id context.
 */
export async function GET(req: NextRequest) {
  const companyId = req.headers.get(COMPANY_HEADER) ?? req.nextUrl.searchParams.get('companyId') ?? undefined;
  if (!companyId || !isSafeId(companyId)) {
    return NextResponse.json({ message: 'Company context required' }, { status: 400 });
  }

  const token = await readSessionToken();
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const r = await backendFetch<unknown>(`world-state/snapshot/${companyId}`, {
    companyId,
    token,
  });

  if (!r.ok) {
    return NextResponse.json(r.error, { status: r.status });
  }

  return NextResponse.json(r.data, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
