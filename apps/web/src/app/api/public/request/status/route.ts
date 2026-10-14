import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from '@/server/api';
import { isSameOrigin } from '@/server/origin';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * Customer status lookup: reference + the email it was submitted with (POST, so the email never sits in a URL or log).
 * Returns only the reference, a coarse status and the submission date.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403, headers: noStore });
  const body = (await req.json().catch(() => null)) as { reference?: unknown; email?: unknown } | null;
  const reference = typeof body?.reference === 'string' ? body.reference.trim().toUpperCase() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!/^REQ-[A-Z0-9]{10}$/.test(reference) || !email || email.length > 254) return NextResponse.json({ message: 'No request matches that reference and email' }, { status: 404, headers: noStore });
  const r = await backendFetch<{ reference: string; status: string; submittedAt: string }>('public/requests/status', { method: 'POST', body: { reference, email }, token: null, signal: req.signal });
  if (!r.ok) return NextResponse.json({ message: r.error.message }, { status: r.status, headers: noStore });
  return NextResponse.json({ reference: r.data.reference, status: r.data.status, submittedAt: r.data.submittedAt }, { headers: noStore });
}
