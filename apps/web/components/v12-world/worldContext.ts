'use client';

import { API_BASE, authHeaders, chairmanFetch, getCompanyHeader, getToken, setCompanyHeader } from '../../app/lib/api';

export interface WorldContext {
  companyId: string | null;
  apiBaseUrl: string;
  headers: Record<string, string>;
  authToken: string | null;
}

/**
 * Resolves the authenticated Aevora company context for the 3D world. Uses the same company selection
 * (localStorage `aevora_company_id`, sent as `x-company-id`) and JWT as the rest of the Chairman app.
 * No company is ever hard-coded; without a selection the world stays empty.
 */
export function resolveWorldContext(): WorldContext {
  let companyId = getCompanyHeader();
  if (!companyId && typeof window !== 'undefined') {
    const stored = localStorage.getItem('aevora_company_id');
    if (stored) {
      setCompanyHeader(stored);
      companyId = stored;
    }
  }
  const headers = authHeaders();
  delete headers['Content-Type'];
  return { companyId, apiBaseUrl: API_BASE, headers, authToken: getToken() };
}

/** Short-lived SSE token (EventSource cannot send headers; the session JWT never goes in the URL). */
export async function fetchStreamToken(): Promise<string | null> {
  const r = await chairmanFetch<{ token: string }>('/auth/stream-token', { method: 'POST' });
  return r.data?.token ?? null;
}

export async function enterReplaySession(companyId: string) {
  return chairmanFetch(`/world-state/replay/session/${encodeURIComponent(companyId)}`, { method: 'POST' });
}

export async function exitReplaySession(companyId: string) {
  return chairmanFetch(`/world-state/replay/session/${encodeURIComponent(companyId)}`, { method: 'DELETE' });
}

export async function traceHistoricalEvent(companyId: string, eventId: string) {
  return chairmanFetch(`/world-state/history/trace/${encodeURIComponent(companyId)}/${encodeURIComponent(eventId)}`);
}
