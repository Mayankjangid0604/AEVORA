import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

import { POST as streamTokenPost } from '@/app/api/bff/stream-token/route';
import { GET as spatialSnapshotGet } from '@/app/api/bff/spatial-snapshot/route';
import { CAMERA_PRESETS } from '@/components/spatial/SpatialScene';
import { SESSION_COOKIE } from '@/lib/session-cookie';

const ORIGIN = 'http://localhost:3000';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJhY3RvcklkIjoiY2hhaXItQSJ9.sig';
const fetchMock = vi.fn();

function backendReply(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`${ORIGIN}${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });

const get = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(`${ORIGIN}${url}`, {
    method: 'GET',
    headers,
  });

beforeEach(() => {
  jar.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('V15-A Stream Token BFF Endpoint', () => {
  it('rejects requests without company context header with 400', async () => {
    jar.set(SESSION_COOKIE, JWT);
    const res = await streamTokenPost(post('/api/bff/stream-token', {}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('Company context required');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await streamTokenPost(
      post('/api/bff/stream-token', {}, { 'x-aevora-company': 'comp-alpha' })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toContain('Not authenticated');
  });

  it('mints a short-lived SSE stream-token without exposing the session JWT to browser', async () => {
    jar.set(SESSION_COOKIE, JWT);
    const mockStreamToken = 'sse-stream-token-xyz-60s';
    backendReply(200, { token: mockStreamToken });

    const res = await streamTokenPost(
      post('/api/bff/stream-token', {}, { 'x-aevora-company': 'comp-alpha' })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe(mockStreamToken);
    expect(data.streamUrl).toContain('/world-state/stream/comp-alpha?token=sse-stream-token-xyz-60s');
    expect(data.apiBaseUrl).toBeDefined();

    // Verify session JWT is never leaked in the body
    expect(JSON.stringify(data)).not.toContain(JWT);

    // Verify backend was called with the session JWT and company context
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/auth/stream-token');
    expect(init.headers['Authorization']).toBe(`Bearer ${JWT}`);
    expect(init.headers['X-Company-Id']).toBe('comp-alpha');
  });
});

describe('V15-A Spatial Snapshot BFF Endpoint', () => {
  it('rejects snapshot fetch without company context with 400', async () => {
    jar.set(SESSION_COOKIE, JWT);
    const res = await spatialSnapshotGet(get('/api/bff/spatial-snapshot'));
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated snapshot fetch with 401', async () => {
    const res = await spatialSnapshotGet(
      get('/api/bff/spatial-snapshot', { 'x-aevora-company': 'comp-alpha' })
    );
    expect(res.status).toBe(401);
  });

  it('forwards authorized snapshot fetch with session token and company context', async () => {
    jar.set(SESSION_COOKIE, JWT);
    const mockSnapshot = {
      sequence: 42,
      version: 'v12',
      entities: {
        'room-1': { id: 'room-1', name: 'Chairman Office', type: 'ROOM' },
      },
    };
    backendReply(200, mockSnapshot);

    const res = await spatialSnapshotGet(
      get('/api/bff/spatial-snapshot', { 'x-aevora-company': 'comp-alpha' })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sequence).toBe(42);
    expect(data.entities['room-1'].name).toBe('Chairman Office');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/world-state/snapshot/comp-alpha');
    expect(init.headers['Authorization']).toBe(`Bearer ${JWT}`);
    expect(init.headers['X-Company-Id']).toBe('comp-alpha');
  });
});

describe('V15-A Spatial Scene Foundation', () => {
  it('defines stable camera presets with valid positions', () => {
    expect(CAMERA_PRESETS.length).toBeGreaterThanOrEqual(4);
    const ids = CAMERA_PRESETS.map((p) => p.id);
    expect(ids).toContain('overview');
    expect(ids).toContain('executive');
    expect(ids).toContain('main');
    expect(ids).toContain('parking');

    for (const preset of CAMERA_PRESETS) {
      expect(preset.position).toHaveLength(3);
      expect(preset.target).toHaveLength(3);
      expect(Number.isFinite(preset.position[0])).toBe(true);
      expect(Number.isFinite(preset.position[1])).toBe(true);
      expect(Number.isFinite(preset.position[2])).toBe(true);
    }
  });
});
