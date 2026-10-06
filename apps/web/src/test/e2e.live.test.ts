/**
 * Live end-to-end checks against the running web app (BFF + real API + real PostgreSQL).
 * Opt-in: runs only when E2E_BASE_URL, E2E_IDENTIFIER, E2E_PASSWORD, E2E_COMPANY and E2E_FOREIGN_COMPANY are set,
 * e.g. against `npm run dev` with the API started from scripts/safe-local.env. Read-only: every request is a GET,
 * apart from the login/logout of the test session itself.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COMPANY_DOMAINS } from '@/lib/domains';

const env = process.env;
const BASE = env.E2E_BASE_URL ?? '';
const OWN = env.E2E_COMPANY ?? '';
const FOREIGN = env.E2E_FOREIGN_COMPANY ?? '';
const enabled = !!(BASE && env.E2E_IDENTIFIER && env.E2E_PASSWORD && OWN && FOREIGN);

let cookie = '';
const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { headers: { cookie, ...headers }, redirect: 'manual' });
const bff = (path: string, company: string | null = OWN) =>
  get(`/api/bff/${path}`, company ? { 'x-aevora-company': company } : {});

/** Fields that must never reach the browser from any Company OS route. */
const SENSITIVE = /access_token|"password"|credential|salary|contactEmail|contactPhone|imagePrompt|systemInstructions|"configuration"|"payload"|"context"|identitySeed|DATABASE_URL|"error":/i;

describe.skipIf(!enabled)('E2E (live)', () => {
  beforeAll(async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ identifier: env.E2E_IDENTIFIER, password: env.E2E_PASSWORD }),
    });
    expect(r.status).toBe(200);
    const set = r.headers.get('set-cookie') ?? '';
    cookie = set.split(';')[0]!;
    // JWT is only in an httpOnly, SameSite=Strict cookie; never in the response body (so never in JS/browser storage).
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(await r.text()).not.toMatch(/eyJ|token/i);
  });

  it('unauthenticated page and BFF requests are refused', async () => {
    const page = await fetch(`${BASE}/company/${OWN}/ceo`, { redirect: 'manual' });
    expect([302, 303, 307, 308]).toContain(page.status);
    expect(page.headers.get('location')).toMatch(/\/login/);
    expect((await fetch(`${BASE}/api/bff/agents`, { headers: { 'x-aevora-company': OWN } })).status).toBe(401);
  });

  it('every navigation entry renders for the own company (no dead links)', async () => {
    for (const path of [`/company/${OWN}`, ...COMPANY_DOMAINS.map((d) => `/company/${OWN}/${d.slug}`)]) {
      expect((await get(path)).status, path).toBe(200);
    }
  });

  it('removed placeholders are gone', async () => {
    for (const path of ['/assistant', '/admin', '/reports', '/decisions', '/attention', `/company/${OWN}/research`, `/company/${OWN}/improvement`]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  const reads = ['agents', 'assistant/messages', 'chairman-mail', 'chairman-mail/unread-count', 'ceo/feed', 'ceo/questions',
    'chairman/decisions', 'chairman/alerts', 'organization/employees', 'marketing-content/posts', 'lead-gen/runs', 'lead-gen/leads'];

  it('own-company reads succeed and carry no sensitive fields', async () => {
    for (const p of [...reads, `operating-loop/${OWN}/cycles`]) {
      const r = await bff(p);
      expect(r.status, p).toBe(200);
      expect(await r.text(), p).not.toMatch(SENSITIVE);
    }
  });

  it('company isolation: foreign 403, missing header 400, mismatched path/header 400', async () => {
    for (const p of reads) {
      expect((await bff(p, FOREIGN)).status, p).toBe(403);
      expect((await bff(p, null)).status, p).toBe(400);
    }
    expect((await bff(`operating-loop/${FOREIGN}/cycles`, OWN)).status).toBe(400);
  });

  it('malformed and nonexistent ids fail closed', async () => {
    expect((await bff('operating-loop/cycle/bad%20id')).status).toBe(404);
    expect((await bff('operating-loop/cycle/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect((await bff('tasks/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    // The company layout calls notFound(); with streaming (loading.tsx) Next sends the 404 boundary in a 200 response.
    const page = await get('/company/not%20an%20id');
    expect(await page.text()).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('side-effecting and model routes are unreachable through the BFF', async () => {
    for (const p of ['assistant/message', 'chairman-mail/x', 'agents/x/run', 'ceo/ask', 'lead-gen/trigger', 'outreach/process',
      'marketing-content/posts/generate', `operating-loop/${OWN}/cycle`, 'chairman/decisions/x/approve']) {
      expect((await bff(p)).status, p).toBe(404);
    }
  });
});
