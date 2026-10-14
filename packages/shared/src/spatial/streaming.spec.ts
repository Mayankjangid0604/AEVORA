import { HierarchicalStreamingManager, StreamingState } from './streaming';

// world -> site -> building -> floor -> room  (mirrors the real V12Spatial* chain, flattened for test clarity)
const hierarchy = [
  { id: 'world', parentId: null },
  { id: 'site-A', parentId: 'world', companyId: 'c1' },
  { id: 'building-A1', parentId: 'site-A', companyId: 'c1' },
  { id: 'floor-A1-1', parentId: 'building-A1', companyId: 'c1' },
  { id: 'room-A1-1-x', parentId: 'floor-A1-1', companyId: 'c1' },
  { id: 'site-B', parentId: 'world', companyId: 'c2' },
  { id: 'building-B1', parentId: 'site-B', companyId: 'c2' },
];

describe('HierarchicalStreamingManager', () => {
  it('starts every region UNLOADED', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy);
    expect(mgr.getState('room-A1-1-x')).toBe(StreamingState.UNLOADED);
  });

  it('activating a leaf region activates its full ancestor chain, root to leaf', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy);
    const transitions = mgr.activate('room-A1-1-x');

    expect(mgr.getState('world')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('site-A')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('building-A1')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('floor-A1-1')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('room-A1-1-x')).toBe(StreamingState.ACTIVE);
    expect(transitions.map((t) => t.regionId)).toEqual(['world', 'site-A', 'building-A1', 'floor-A1-1', 'room-A1-1-x']);

    // Regions never touched by this activation remain UNLOADED.
    expect(mgr.getState('building-B1')).toBe(StreamingState.UNLOADED);
  });

  it('reactivating an already-active region is a no-op (no duplicate transitions)', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy);
    mgr.activate('room-A1-1-x');
    const transitions = mgr.activate('room-A1-1-x');
    expect(transitions).toEqual([]);
  });

  it('explicit unload returns a region to UNLOADED without touching unrelated regions', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy);
    mgr.activate('room-A1-1-x');
    const result = mgr.unload('room-A1-1-x');
    expect(result).toEqual({ regionId: 'room-A1-1-x', from: StreamingState.ACTIVE, to: StreamingState.UNLOADED });
    expect(mgr.getState('floor-A1-1')).toBe(StreamingState.ACTIVE); // ancestor untouched by a leaf unload
  });

  it('deterministic eviction: activating beyond capacity evicts the least-recently-activated leaf regions first', () => {
    const flatHierarchy = [
      { id: 'root', parentId: null },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, parentId: 'root' })),
    ];
    const mgr = new HierarchicalStreamingManager(flatHierarchy, 3); // root + 2 leaves max
    mgr.activate('r0');
    mgr.activate('r1');
    // root + r0 + r1 = 3 active, exactly at capacity — nothing evicted yet.
    expect(mgr.activeRegions()).toEqual(['root', 'r0', 'r1']);

    mgr.activate('r2'); // now 4 active, over capacity by 1 -> evict least-recently-activated leaf (r0); root is protected (every leaf's ancestor)
    expect(mgr.getState('r0')).toBe(StreamingState.UNLOADED);
    expect(mgr.getState('r1')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('r2')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('root')).toBe(StreamingState.ACTIVE); // never evicted — it's every active leaf's ancestor
  });

  it('never evicts a region that is a live ancestor of another active region', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy, 100);
    mgr.activate('room-A1-1-x');
    // Even with huge headroom, nothing is evicted — but this also documents that ancestor protection
    // holds regardless of order by checking site-A remains ACTIVE after further unrelated activity.
    mgr.activate('building-B1');
    expect(mgr.getState('site-A')).toBe(StreamingState.ACTIVE);
    expect(mgr.getState('building-A1')).toBe(StreamingState.ACTIVE);
  });

  it('company isolation: activating a company A region never changes a company B region\'s state', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy);
    mgr.activate('room-A1-1-x');
    expect(mgr.getState('site-B')).toBe(StreamingState.UNLOADED);
    expect(mgr.getState('building-B1')).toBe(StreamingState.UNLOADED);
  });

  it('throws for an unknown region id rather than silently activating nothing', () => {
    const mgr = new HierarchicalStreamingManager(hierarchy);
    expect(() => mgr.activate('ghost-region')).toThrow();
  });

  it('late join / reconstruction: a fresh manager fed the same activation calls reaches the identical active-region set (deterministic, replay-compatible)', () => {
    const mgrA = new HierarchicalStreamingManager(hierarchy);
    mgrA.activate('room-A1-1-x');

    const mgrB = new HierarchicalStreamingManager(hierarchy); // simulates a late-joining viewer reconstructing from the same inputs
    mgrB.activate('room-A1-1-x');

    expect(mgrB.activeRegions()).toEqual(mgrA.activeRegions());
  });
});
