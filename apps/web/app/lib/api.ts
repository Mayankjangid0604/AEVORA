// Must be set in the hosting environment (e.g. Vercel → Settings → Environment Variables) to the public API URL.
// The fallback matches the API's default local port.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13000';

/** For pages that call fetch directly: JSON + the Chairman's bearer token. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

let _jwtToken: string | null = null;

export function setToken(token: string) {
  _jwtToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('aevora_jwt', token);
  }
}

export function getToken(): string | null {
  if (_jwtToken) return _jwtToken;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('aevora_jwt');
    if (stored) {
      _jwtToken = stored;
      return _jwtToken;
    }
  }
  return null;
}

export function clearToken() {
  _jwtToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('aevora_jwt');
  }
}

interface FetchOptions {
  method?: string;
  body?: any;
  chairmanId?: string;
}

export async function chairmanFetch<T = any>(path: string, opts: FetchOptions = {}): Promise<{ data: T | null; error: string | null; loading: false }> {
  try {
    const token = getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });

    if (res.status === 401 && typeof window !== 'undefined') {
      clearToken();
      window.dispatchEvent(new Event('aevora:unauthorized'));
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}`, loading: false };
    }

    const data = await res.json();
    return { data, error: null, loading: false };
  } catch (e: any) {
    return { data: null, error: e.message || 'Network error', loading: false };
  }
}

/** Company event stream (SSE). EventSource can't send headers, so it gets a 60 s stream-only token in ?token= (never the session JWT). */
export async function openCompanyStream(): Promise<EventSource | null> {
  const r = await chairmanFetch<{ token: string }>('/auth/stream-token', { method: 'POST' });
  return r.data?.token ? new EventSource(`${API_BASE}/company-conversations/stream?token=${encodeURIComponent(r.data.token)}`) : null;
}

// ── Typed API helpers ──

export async function login(email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: email, credential: password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.message || `Sign-in failed (HTTP ${res.status})`;
    setToken(body.access_token);
    return null;
  } catch (e: any) {
    return e.message || 'Cannot reach the AEVORA API';
  }
}

export const api = {
  overview: () => chairmanFetch('/chairman/overview'),
  financials: () => chairmanFetch('/chairman/financials'),
  employees: () => chairmanFetch('/chairman/employees'),
  employee: (id: string) => chairmanFetch(`/chairman/employees/${id}`),
  projects: () => chairmanFetch('/chairman/projects'),
  project: (id: string) => chairmanFetch(`/chairman/projects/${id}`),
  departments: () => chairmanFetch('/chairman/departments'),
  alerts: () => chairmanFetch('/chairman/alerts'),
  decisions: () => chairmanFetch('/chairman/decisions'),
  activity: () => chairmanFetch('/chairman/activity'),
  simulation: () => chairmanFetch('/chairman/simulation'),
  world: () => chairmanFetch('/chairman/world'),

  approveDecision: (id: string) => chairmanFetch(`/chairman/decisions/${id}/approve`, { method: 'POST' }),
  rejectDecision: (id: string) => chairmanFetch(`/chairman/decisions/${id}/reject`, { method: 'POST' }),

  startSimulation: () => chairmanFetch('/chairman/simulation/start', { method: 'POST' }),
  pauseSimulation: () => chairmanFetch('/chairman/simulation/pause', { method: 'POST' }),
  resumeSimulation: () => chairmanFetch('/chairman/simulation/resume', { method: 'POST' }),

  // Communication (Phase 10)
  conversations: () => chairmanFetch('/chairman/communication/conversations'),
  conversation: (id: string) => chairmanFetch(`/chairman/communication/conversations/${id}`),
  meetings: () => chairmanFetch('/chairman/communication/meetings'),
  meeting: (id: string) => chairmanFetch(`/chairman/communication/meetings/${id}`),
  notifications: () => chairmanFetch('/chairman/communication/notifications'),

  // Knowledge (Phase 11)
  knowledge: () => chairmanFetch('/chairman/knowledge'),
  knowledgeRecord: (id: string) => chairmanFetch(`/chairman/knowledge/${id}`),
  knowledgeProvenance: (id: string) => chairmanFetch(`/chairman/knowledge/${id}/provenance`),
  validateKnowledge: (id: string, result: 'SUPPORTED' | 'UNSUPPORTED', reason?: string) => chairmanFetch(`/chairman/knowledge/${id}/validate`, { method: 'POST', body: { result, reason } }),

  // Voice (Phase 14)
  voiceProfile: (employeeId: string) => chairmanFetch(`/voice-profile/${employeeId}`),
  voiceAssign: (employeeId: string) => chairmanFetch(`/voice-profile/${employeeId}/assign`, { method: 'POST' }),
  voiceUpdate: (employeeId: string, data: any) => chairmanFetch(`/voice-profile/${employeeId}`, { method: 'PUT', body: data }),
  voiceGenerate: (employeeId: string, text: string, context?: any) => chairmanFetch(`/voice-profile/${employeeId}/generate`, { method: 'POST', body: { text, context } }),
  
  // Voice Simulation (Phase 10 & 11)
  companyConversationsCreate: (data: any) => chairmanFetch('/company-conversations', { method: 'POST', body: data }),
  companyConversationGet: (id: string) => chairmanFetch(`/company-conversations/${id}`),
  companyConversationTurn: (id: string, forceSpeakerId?: string) => chairmanFetch(`/company-conversations/${id}/turn`, { method: 'POST', body: { forceSpeakerId } }),
  companyConversationStop: (id: string) => chairmanFetch(`/company-conversations/${id}/stop`, { method: 'POST' }),
  
  autonomyStateSet: (state: string) => chairmanFetch('/company-conversations/autonomy/state', { method: 'POST', body: { state } }),
  autonomyStateGet: () => chairmanFetch('/company-conversations/autonomy/state'),
  autonomyEventTrigger: (data: any) => chairmanFetch('/company-conversations/autonomy/event', { method: 'POST', body: data }),
};
