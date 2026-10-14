import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from '@/server/api';
import { isSameOrigin } from '@/server/origin';

const noStore = { 'Cache-Control': 'no-store' };
const FIELDS = ['businessName', 'contactName', 'email', 'phone', 'service', 'description', 'website'] as const;

/** Public form -> API. Anonymous (never forwards a session), same-origin only, only the known fields, small bodies. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403, headers: noStore });
  const raw = await req.text();
  if (raw.length > 16_000) return NextResponse.json({ message: 'Request too large' }, { status: 413, headers: noStore });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ message: 'Invalid request' }, { status: 400, headers: noStore }); }
  const clean = Object.fromEntries(FIELDS.map((k) => [k, typeof body?.[k] === 'string' ? body[k] : '']));
  const r = await backendFetch<{ reference: string; status: string; message: string }>('public/requests', { method: 'POST', body: clean, token: null, signal: req.signal });
  if (!r.ok) return NextResponse.json({ message: r.error.message }, { status: r.status, headers: noStore });
  return NextResponse.json({ reference: r.data.reference, status: r.data.status, message: r.data.message }, { status: 201, headers: noStore });
}
