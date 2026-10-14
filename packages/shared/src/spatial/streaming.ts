/**
 * V12 hierarchical world streaming foundation (decision 98).
 *
 * This is NOT React/rendering lazy-loading. It is a deterministic, renderer-independent streaming
 * *state machine* over the existing World → Region → Country → City → Site → Building → Floor →
 * Room hierarchy (the actual Prisma model chain: V12SpatialWorld/Region/Country/City/Site/
 * Building/Floor/Room). It tracks which regions of that hierarchy are UNLOADED / LOADING / LOADED /
 * ACTIVE / EVICTING — nothing more. It never holds or touches actual WorldEntity data: unloading a
 * region here only changes a streaming-state flag for that region id, never deletes anything from
 * the authoritative world-state reducer, snapshot, or history. A region's entities are always
 * reconstructable from the existing snapshot/replay mechanisms regardless of this manager's state,
 * which is what makes "entity preservation across unload/reload" true by construction rather than
 * by careful bookkeeping that could drift.
 *
 * The renderer (or a future real asset/geometry streaming layer) is told what to load/show by
 * reading this manager's state; it is never the authority over that state.
 */

export enum StreamingState {
  UNLOADED = 'UNLOADED',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  ACTIVE = 'ACTIVE',
  EVICTING = 'EVICTING',
}

export interface RegionNode {
  id: string;
  parentId: string | null;
  companyId?: string; // present on company-owned regions (site/building/floor); absent on shared geography (world/region/country/city)
}

export interface StreamingTransition {
  regionId: string;
  from: StreamingState;
  to: StreamingState;
}

/**
 * Deterministic hierarchical streaming manager. Activation always loads+activates the full ancestor
 * chain first (a building cannot be ACTIVE while its site is UNLOADED); eviction is deterministic
 * least-recently-activated-first, and never evicts a region that is itself in another active
 * region's ancestor chain (you cannot evict a site while one of its buildings is still active).
 */
export class HierarchicalStreamingManager {
  private states = new Map<string, StreamingState>();
  private nodesById = new Map<string, RegionNode>();
  /** Order regions were last activated, oldest first — the deterministic eviction queue. */
  private activationOrder: string[] = [];

  constructor(hierarchy: RegionNode[], private readonly maxActiveRegions: number = 8) {
    for (const node of hierarchy) this.nodesById.set(node.id, node);
  }

  getState(regionId: string): StreamingState {
    return this.states.get(regionId) ?? StreamingState.UNLOADED;
  }

  private ancestorChain(regionId: string): string[] {
    const chain: string[] = [];
    let current: string | null = regionId;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) throw new Error(`cycle detected in region hierarchy at ${current}`);
      seen.add(current);
      chain.unshift(current);
      current = this.nodesById.get(current)?.parentId ?? null;
    }
    return chain;
  }

  private descendantsOf(regionId: string): string[] {
    const result: string[] = [];
    for (const node of this.nodesById.values()) {
      if (this.ancestorChain(node.id).includes(regionId) && node.id !== regionId) result.push(node.id);
    }
    return result;
  }

  /**
   * Activates a region and its full ancestor chain, deterministically. Returns every transition
   * that occurred, in the order they were applied (ancestors first, root to leaf).
   */
  activate(regionId: string): StreamingTransition[] {
    if (!this.nodesById.has(regionId)) throw new Error(`unknown region: ${regionId}`);
    const chain = this.ancestorChain(regionId);
    const transitions: StreamingTransition[] = [];

    for (const id of chain) {
      const from = this.getState(id);
      if (from !== StreamingState.ACTIVE) {
        this.states.set(id, StreamingState.LOADING);
        this.states.set(id, StreamingState.LOADED);
        this.states.set(id, StreamingState.ACTIVE);
        transitions.push({ regionId: id, from, to: StreamingState.ACTIVE });
        // Only a real state transition bumps LRU order — an already-active ancestor pulled in
        // incidentally by a sibling's activation isn't "freshly used" and shouldn't jump the queue.
        this.activationOrder = this.activationOrder.filter((r) => r !== id);
        this.activationOrder.push(id);
      }
    }
    // The explicitly requested region itself is always the most recently used, even if it (unusually)
    // was already active and nothing transitioned.
    this.activationOrder = this.activationOrder.filter((r) => r !== regionId);
    this.activationOrder.push(regionId);

    transitions.push(...this.evictIfOverCapacity());
    return transitions;
  }

  /** Explicitly unloads one region (not its ancestors/descendants) back to UNLOADED. A no-op if already unloaded. */
  unload(regionId: string): StreamingTransition | null {
    const from = this.getState(regionId);
    if (from === StreamingState.UNLOADED) return null;
    this.states.set(regionId, StreamingState.EVICTING);
    this.states.set(regionId, StreamingState.UNLOADED);
    this.activationOrder = this.activationOrder.filter((r) => r !== regionId);
    return { regionId, from, to: StreamingState.UNLOADED };
  }

  /**
   * Deterministic LRU-style eviction: when more than `maxActiveRegions` are ACTIVE, evict the
   * least-recently-activated ones first — but never a region that is a live ancestor of another
   * still-active region (its children would become orphaned).
   */
  private evictIfOverCapacity(): StreamingTransition[] {
    const transitions: StreamingTransition[] = [];
    const activeRegions = () => this.activationOrder.filter((id) => this.getState(id) === StreamingState.ACTIVE);

    while (activeRegions().length > this.maxActiveRegions) {
      const active = activeRegions();
      const ancestorsStillNeeded = new Set<string>();
      for (const id of active) for (const ancestor of this.ancestorChain(id)) if (ancestor !== id) ancestorsStillNeeded.add(ancestor);

      const evictable = active.find((id) => !ancestorsStillNeeded.has(id));
      if (!evictable) break; // everything active is someone's ancestor — cannot evict further without breaking a dependency
      const result = this.unload(evictable);
      if (result) transitions.push(result);
    }
    return transitions;
  }

  /** All currently ACTIVE region ids, in activation order. */
  activeRegions(): string[] {
    return this.activationOrder.filter((id) => this.getState(id) === StreamingState.ACTIVE);
  }
}
