import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Static guarantees over the frontend source: no JWT in browser code, no fake data, no V15 imports. */
const SRC = path.resolve(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? (f === 'test' ? [] : files(p)) : /\.(ts|tsx)$/.test(f) ? [p] : [];
});
const all = files(SRC).map((p) => ({ p: path.relative(SRC, p).replace(/\\/g, '/'), s: readFileSync(p, 'utf8') }));
const client = all.filter((f) => /^['"]use client['"]/.test(f.s.trimStart()));

describe('frontend security scan', () => {
  it('finds client components to scan', () => expect(client.length).toBeGreaterThan(0));

  it('client code never touches tokens, Authorization headers or web storage', () => {
    for (const f of client) {
      expect(f.s, f.p).not.toMatch(/access_token|Authorization|Bearer|localStorage|sessionStorage|document\.cookie/);
      expect(f.s, f.p).not.toMatch(/from ['"]@\/server\//);
    }
  });

  it('only server code reads the session cookie', () => {
    const readers = all.filter((f) => /cookies\(\)/.test(f.s)).map((f) => f.p);
    expect(readers).toEqual(['server/api.ts']);
  });

  it('no client-supplied ownership authority, secrets or V15/spatial code in V14 routes', () => {
    const v14Files = all.filter((f) => !f.p.startsWith('components/spatial/') && !f.p.includes('/world/'));
    for (const f of v14Files) {
      expect(f.s, f.p).not.toMatch(/chairmanId/);
      expect(f.s, f.p).not.toMatch(/NEXT_PUBLIC_|JWT_SECRET|API_KEY|SMTP_PASS/);
      expect(f.s, f.p).not.toMatch(/shared\/v12|@aevora\/shared|world-engine|v12-|webxr|three/i);
    }
    for (const f of all) {
      expect(f.s, f.p).not.toMatch(/chairmanId/);
      expect(f.s, f.p).not.toMatch(/JWT_SECRET|API_KEY|SMTP_PASS/);
    }
  });

  it('no hardcoded company ids (uuids) or fixture data in app code', () => {
    for (const f of all) expect(f.s, f.p).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
