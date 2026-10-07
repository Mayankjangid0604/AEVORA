import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';

/**
 * BFF endpoint to generate an ephemeral, short-lived (60s) 'purpose: sse' token
 * for opening an EventSource stream to the backend without exposing the session JWT.
 */
export async function POST(req: NextRequest) {
  const companyId = req.headers.get(COMPANY_HEADER) ?? undefined;
  if (!companyId || !isSafeId(companyId)) {
    return NextResponse.json({ message: 'Company context required' }, { status: 400 });
  }

  const token = await readSessionToken();
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const r = await backendFetch<{ token: string }>('auth/stream-token', {
    method: 'POST',
    companyId,
    token,
  });

  if (!r.ok) {
    return NextResponse.json(r.error, { status: r.status });
  }

  const apiUrl = (process.env.AEVORA_API_URL ?? 'http://localhost:13000').replace(/\/+$/, '');
  return NextResponse.json({
    token: r.data.token,
    apiBaseUrl: apiUrl,
    streamUrl: `${apiUrl}/world-state/stream/${companyId}?token=${r.data.token}`,
  }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
