/**
 * Test-only in-memory stand-in for `prisma.v12SpatialHistoryEvent`. Excluded from the production build
 * (tsconfig `**\/testing/**`). Honours the query shapes used by WorldStateReplayService: equality, BigInt
 * sequence ranges, timestamp ranges, NOT, orderBy sequence asc/desc, take, deleteMany and groupBy.
 */
import { V12EventType } from '@aevora/shared';

export class FakeHistoryStore {
  rows: any[] = [];
  calls: { op: string; args: any }[] = [];
  failing = false;

  private cmp(v: any, cond: any): boolean {
    if (cond === undefined) return true;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && typeof cond !== 'bigint') {
      const n = (x: any) => (x instanceof Date ? x.getTime() : x);
      const val = n(v);
      if (cond.gt !== undefined && !(val > n(cond.gt))) return false;
      if (cond.gte !== undefined && !(val >= n(cond.gte))) return false;
      if (cond.lt !== undefined && !(val < n(cond.lt))) return false;
      if (cond.lte !== undefined && !(val <= n(cond.lte))) return false;
      return true;
    }
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
    return v === cond;
  }

  private match(r: any, where: any = {}): boolean {
    for (const [k, cond] of Object.entries(where)) {
      if (k === 'NOT') { if (this.match(r, cond)) return false; continue; }
      if (!this.cmp(r[k], cond)) return false;
    }
    return true;
  }

  private query(args: any = {}): any[] {
    if (this.failing) throw new Error('connection refused');
    let out = this.rows.filter(r => this.match(r, args.where));
    const order = args.orderBy?.[0]?.sequence;
    if (order) out = out.sort((a, b) => (a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0) * (order === 'desc' ? -1 : 1));
    if (args.take !== undefined) out = out.slice(0, args.take);
    return out.map(r => ({ ...r }));
  }

  findMany = async (args: any) => { this.calls.push({ op: 'findMany', args }); return this.query(args); };
  findFirst = async (args: any) => { this.calls.push({ op: 'findFirst', args }); return this.query({ ...args, take: 1 })[0] ?? null; };
  deleteMany = async (args: any) => {
    this.calls.push({ op: 'deleteMany', args });
    if (this.failing) throw new Error('connection refused');
    const before = this.rows.length;
    this.rows = this.rows.filter(r => !this.match(r, args.where));
    return { count: before - this.rows.length };
  };
  groupBy = async (_args: any) => {
    const by = new Map<string, bigint>();
    for (const r of this.rows) by.set(r.companyId, by.has(r.companyId) && by.get(r.companyId)! > r.sequence ? by.get(r.companyId)! : r.sequence);
    return [...by.entries()].map(([companyId, max]) => ({ companyId, _max: { sequence: max } }));
  };
}

export const BASE = 1_700_000_000_000;
export const NOW = BASE + 10_000;
export const DAY = 24 * 60 * 60 * 1000;

export const fullEntity = (id: string, x = 0) => ({
  id, type: 'PERSON',
  transform: { position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
  visibility: { isVisible: true },
});

export const historyRow = (companyId: string, sequence: number, eventType: string, t: number, entityId: string, payload: any, extra: any = {}) => ({
  companyId,
  eventId: extra.eventId ?? `${companyId}-evt${sequence}`,
  schemaVersion: '1.0.0',
  sequence: BigInt(sequence),
  eventType,
  authoritativeTimestamp: new Date(t),
  entityId,
  entityType: 'PERSON',
  correlationId: extra.correlationId ?? null,
  causationId: extra.causationId ?? null,
  payload,
});

/** Persisted history fixture: A complete, B separate scope, C no baseline, D gap at 3, E late baseline. */
export function seedHistory(store: FakeHistoryStore) {
  const row = historyRow, full = fullEntity;
  store.rows = [
    row('A', 1, V12EventType.WORLD_BASELINE, BASE + 1000, 'world', { entities: { e1: full('e1'), e2: full('e2', 9) }, topology: [], navigationNodes: [], movementStates: {} }),
    row('A', 2, V12EventType.TRANSFORM_UPDATED, BASE + 2000, 'e1', { position: { x: 5, y: 0, z: 0 } }),
    row('A', 3, V12EventType.ENTITY_CREATED, BASE + 3000, 'e3', { type: 'PERSON', name: 'Partial' }, { correlationId: 'c1' }),
    row('A', 4, V12EventType.MOVEMENT_STARTED, BASE + 3000, 'e1', { movementState: { entityId: 'e1', movementState: 'MOVING' } }, { correlationId: 'c1', causationId: 'A-evt3' }),
    row('A', 5, V12EventType.ENTITY_DELETED, BASE + 4000, 'e2', {}, { causationId: 'A-evt4' }),
    row('A', 6, V12EventType.ENTITY_UPDATED, BASE + 5000, 'e1', { name: 'Renamed' }, { causationId: 'missing-evt' }),
    row('B', 1, V12EventType.WORLD_BASELINE, BASE + 1000, 'world', { entities: { b1: full('b1') } }),
    row('B', 2, V12EventType.ENTITY_UPDATED, BASE + 2000, 'b1', { name: 'B one' }, { eventId: 'b-evt-2', correlationId: 'c1' }),
    row('C', 1, V12EventType.TRANSFORM_UPDATED, BASE + 1000, 'c1', { position: { x: 1, y: 1, z: 1 } }),
    row('D', 1, V12EventType.WORLD_BASELINE, BASE + 1000, 'world', { entities: { d1: full('d1') } }),
    row('D', 2, V12EventType.ENTITY_UPDATED, BASE + 2000, 'd1', { name: 'd' }),
    row('D', 4, V12EventType.ENTITY_UPDATED, BASE + 4000, 'd1', { name: 'dd' }),
    row('E', 1, V12EventType.ENTITY_UPDATED, BASE + 1000, 'x1', { name: 'pre' }),
    row('E', 2, V12EventType.WORLD_BASELINE, BASE + 2000, 'world', { entities: { x1: full('x1') } }),
    row('E', 3, V12EventType.TRANSFORM_UPDATED, BASE + 3000, 'x1', { position: { x: 2, y: 0, z: 0 } }),
  ];
}
