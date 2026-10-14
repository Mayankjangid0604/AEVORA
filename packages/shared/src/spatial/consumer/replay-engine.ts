import { WorldEntity, V12EntityId, MovementState, TopologyEdge, NavigationNode, WorldSnapshot } from '../world-state';
import { V12EventEnvelope } from '../events';
import { HistoryNotAvailableReason, ReconstructionProvenance, ReplayWindow } from '../history';
import {
  ReducedWorldState,
  applyEvent,
  cloneReducedState,
  emptyReducedState,
  sortEvents,
  stateFromSnapshot,
} from './world-state-reducer';

export enum ReplayState {
  STOPPED = 'STOPPED',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  BUFFERING = 'BUFFERING',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  ERROR = 'ERROR'
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

export interface ReplayScheduler {
  setInterval(fn: () => void, ms: number): any;
  clearInterval(handle: any): void;
  now(): number;
}

export interface ReplayEngineConfig {
  companyId: string;
  apiBaseUrl: string;
  authToken?: string;
  /** Extra request headers, e.g. the Aevora `x-company-id` context header. */
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  scheduler?: ReplayScheduler;
  tickMs?: number;
}

export interface ReplayAvailability {
  status: 'UNLOADED' | 'AVAILABLE' | 'NOT_AVAILABLE' | 'ERROR';
  reason?: HistoryNotAvailableReason | string;
  message?: string;
  provenance?: ReconstructionProvenance;
  requestedFrom?: number;
  effectiveFrom?: number;
  truncated?: boolean;
}

const defaultScheduler: ReplayScheduler = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

/**
 * Renderer-independent, deterministic replay of persisted spatial history.
 *
 * It only reads historical windows (start state + ordered events) and never talks to live streams
 * or mutation endpoints. Position is defined by `cursor` (index of the last applied event; -1 means
 * "at the window start state"). Every seek rebuilds from the start state, so the same position
 * always yields the same state.
 */
export class WorldStateReplayEngine {
  private config: ReplayEngineConfig;
  private scheduler: ReplayScheduler;
  private state: ReplayState = ReplayState.STOPPED;
  private availability: ReplayAvailability = { status: 'UNLOADED' };

  private startState: ReducedWorldState = emptyReducedState();
  private current: ReducedWorldState = emptyReducedState();
  private events: V12EventEnvelope[] = [];
  private cursor = -1;
  private currentTimestamp = 0;
  private minTimestamp = 0;
  private maxTimestamp = 0;
  private playbackSpeed = 1;
  private timer: any = null;
  private lastTick = 0;

  private onStateChangeHandlers: ((state: ReplayState) => void)[] = [];
  private onEntityUpdatedHandlers: ((entity: WorldEntity) => void)[] = [];
  private onEntityRemovedHandlers: ((id: V12EntityId) => void)[] = [];
  private onTimeUpdateHandlers: ((timestamp: number) => void)[] = [];
  private onReplayCompleteHandlers: (() => void)[] = [];
  private onRefreshHandlers: (() => void)[] = [];

  constructor(config: ReplayEngineConfig) {
    this.config = {
      fetchFn: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
      tickMs: 50,
      ...config,
    };
    this.scheduler = config.scheduler || defaultScheduler;
  }

  // --- Subscriptions ---
  public onStateChange(h: (state: ReplayState) => void) { this.onStateChangeHandlers.push(h); }
  public onEntityUpdated(h: (entity: WorldEntity) => void) { this.onEntityUpdatedHandlers.push(h); }
  public onEntityRemoved(h: (id: V12EntityId) => void) { this.onEntityRemovedHandlers.push(h); }
  public onTimeUpdate(h: (timestamp: number) => void) { this.onTimeUpdateHandlers.push(h); }
  public onReplayComplete(h: () => void) { this.onReplayCompleteHandlers.push(h); }
  /** Fired whenever the replay state was rebuilt or changed position (one notification per operation). */
  public onRefresh(h: () => void) { this.onRefreshHandlers.push(h); }
  public clearHandlers() {
    this.onStateChangeHandlers = []; this.onEntityUpdatedHandlers = []; this.onEntityRemovedHandlers = [];
    this.onTimeUpdateHandlers = []; this.onReplayCompleteHandlers = []; this.onRefreshHandlers = [];
  }

  // --- Read-only accessors (replay state only; never live state) ---
  public getState(): ReplayState { return this.state; }
  public getAvailability(): ReplayAvailability { return this.availability; }
  public getEntities(): Map<V12EntityId, WorldEntity> { return new Map(Object.entries(this.current.entities)); }
  public getEntity(id: V12EntityId): WorldEntity | undefined { return this.current.entities[id]; }
  public isPartialEntity(id: V12EntityId): boolean { return this.current.partialEntityIds.has(id); }
  public getPartialEntityIds(): V12EntityId[] { return [...this.current.partialEntityIds].sort(); }
  public getMovementStates(): Map<string, MovementState> { return new Map(Object.entries(this.current.movementStates)); }
  public getTopology(): TopologyEdge[] { return this.current.topology; }
  public getNavigationNodes(): NavigationNode[] { return this.current.navigationNodes; }
  public getCurrentTimestamp(): number { return this.currentTimestamp; }
  public getCurrentSequence(): number { return this.current.sequence; }
  public getCursor(): number { return this.cursor; }
  public getEvents(): readonly V12EventEnvelope[] { return this.events; }
  public getCurrentEvent(): V12EventEnvelope | null { return this.cursor >= 0 ? this.events[this.cursor] : null; }
  public getSpeed(): number { return this.playbackSpeed; }
  public getTimelineRange(): { min: number; max: number } { return { min: this.minTimestamp, max: this.maxTimestamp }; }
  public isLoaded(): boolean { return this.availability.status === 'AVAILABLE'; }

  // --- Loading ---
  public async loadWindow(from: number, to: number): Promise<ReplayAvailability> {
    this.unload();
    this.setState(ReplayState.BUFFERING);
    try {
      if (!this.config.fetchFn) throw new Error('fetch is not defined');
      const headers: Record<string, string> = { ...(this.config.headers || {}) };
      if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;
      const url = `${this.config.apiBaseUrl}/world-state/history/window/${encodeURIComponent(this.config.companyId)}?from=${from}&to=${to}`;
      const response = await this.config.fetchFn(url, { headers });
      if (!response.ok) throw new Error(`Failed to load replay window: HTTP ${response.status}`);
      const window: ReplayWindow = await response.json();
      return this.loadWindowData(window);
    } catch (e: any) {
      this.availability = { status: 'ERROR', message: e?.message || 'Replay window could not be loaded' };
      this.setState(ReplayState.ERROR);
      this.emitRefresh();
      return this.availability;
    }
  }

  /** Loads an already-fetched window. Deterministic: no I/O. */
  public loadWindowData(window: ReplayWindow): ReplayAvailability {
    this.stopTimer();
    if (window.status !== 'OK' || !window.startState) {
      this.startState = emptyReducedState();
      this.current = emptyReducedState();
      this.events = [];
      this.cursor = -1;
      this.minTimestamp = window.requestedFrom;
      this.maxTimestamp = window.requestedTo;
      this.currentTimestamp = window.requestedFrom;
      this.availability = {
        status: 'NOT_AVAILABLE', reason: window.reason, message: window.message,
        requestedFrom: window.requestedFrom,
      };
      this.setState(ReplayState.NOT_AVAILABLE);
      this.emitRefresh();
      return this.availability;
    }

    const start: WorldSnapshot = window.startState;
    this.startState = stateFromSnapshot(start, window.startProvenance?.partialEntityIds || []);
    this.events = sortEvents(window.events).filter(e => e.sequence > start.sequence);
    this.minTimestamp = window.effectiveFrom ?? window.requestedFrom;
    this.maxTimestamp = Math.max(window.requestedTo, this.events.length ? this.events[this.events.length - 1].authoritativeTimestamp : this.minTimestamp);
    this.availability = {
      status: 'AVAILABLE',
      provenance: window.startProvenance,
      requestedFrom: window.requestedFrom,
      effectiveFrom: window.effectiveFrom,
      truncated: window.truncated,
    };
    this.reset();
    return this.availability;
  }

  public unload() {
    this.stopTimer();
    this.startState = emptyReducedState();
    this.current = emptyReducedState();
    this.events = [];
    this.cursor = -1;
    this.currentTimestamp = 0;
    this.minTimestamp = 0;
    this.maxTimestamp = 0;
    this.availability = { status: 'UNLOADED' };
    this.setState(ReplayState.STOPPED);
    this.emitRefresh();
  }

  // --- Transport controls ---

  /** Deterministic reset to the window start state. */
  public reset() {
    this.stopTimer();
    this.rebuildTo(-1);
    this.currentTimestamp = this.minTimestamp;
    this.setState(this.isLoaded() ? ReplayState.STOPPED : this.state);
    this.emitTime();
  }

  public play() {
    if (!this.isLoaded() || this.state === ReplayState.PLAYING) return;
    if (this.currentTimestamp >= this.maxTimestamp && this.cursor >= this.events.length - 1) this.reset();
    this.setState(ReplayState.PLAYING);
    this.lastTick = this.scheduler.now();
    this.timer = this.scheduler.setInterval(() => this.tick(), this.config.tickMs!);
  }

  public pause() {
    if (this.state !== ReplayState.PLAYING) return;
    this.stopTimer();
    this.setState(ReplayState.PAUSED);
  }

  /** Stops playback and returns to the window start. */
  public stop() {
    if (!this.isLoaded()) { this.stopTimer(); return; }
    this.reset();
  }

  public setSpeed(speed: number) {
    if (!(REPLAY_SPEEDS as readonly number[]).includes(speed)) {
      throw new RangeError(`Unsupported replay speed ${speed}. Allowed: ${REPLAY_SPEEDS.join(', ')}`);
    }
    this.playbackSpeed = speed;
    this.lastTick = this.scheduler.now();
  }

  /** SEEK / JUMP_TO_TIMESTAMP: applies every event up to the greatest one with timestamp <= target. */
  public seek(targetTimestamp: number) { this.jumpToTimestamp(targetTimestamp); }

  public jumpToTimestamp(targetTimestamp: number) {
    if (!this.isLoaded() || !Number.isFinite(targetTimestamp)) return;
    const t = Math.min(Math.max(targetTimestamp, this.minTimestamp), this.maxTimestamp);
    this.rebuildTo(this.indexForTimestamp(t));
    this.currentTimestamp = t;
    this.lastTick = this.scheduler.now();
    this.emitTime();
  }

  /** JUMP_TO_EVENT: positions the replay immediately after the given event. Returns false if the event is not in the window. */
  public jumpToEvent(eventId: string): boolean {
    if (!this.isLoaded()) return false;
    const idx = this.events.findIndex(e => e.eventId === eventId);
    if (idx < 0) return false;
    this.pause();
    this.rebuildTo(idx);
    this.currentTimestamp = this.events[idx].authoritativeTimestamp;
    this.emitTime();
    return true;
  }

  public jumpToSequence(sequence: number): boolean {
    const e = this.events.find(ev => ev.sequence === sequence);
    return e ? this.jumpToEvent(e.eventId) : false;
  }

  public stepForward(): boolean {
    if (!this.isLoaded() || this.cursor >= this.events.length - 1) return false;
    this.pause();
    this.applyNext();
    this.currentTimestamp = this.events[this.cursor].authoritativeTimestamp;
    this.emitRefresh();
    this.emitTime();
    return true;
  }

  public stepBackward(): boolean {
    if (!this.isLoaded() || this.cursor < 0) return false;
    this.pause();
    this.rebuildTo(this.cursor - 1);
    this.currentTimestamp = this.cursor >= 0 ? this.events[this.cursor].authoritativeTimestamp : this.minTimestamp;
    this.emitTime();
    return true;
  }

  public dispose() {
    this.stopTimer();
    this.clearHandlers();
  }

  // --- Internal ---

  private tick() {
    const now = this.scheduler.now();
    const delta = (now - this.lastTick) * this.playbackSpeed;
    this.lastTick = now;
    const target = Math.min(this.currentTimestamp + delta, this.maxTimestamp);
    const idx = this.indexForTimestamp(target);
    let advanced = false;
    while (this.cursor < idx) { this.applyNext(); advanced = true; }
    this.currentTimestamp = target;
    if (advanced) this.emitRefresh();
    this.emitTime();
    if (target >= this.maxTimestamp) {
      this.stopTimer();
      this.setState(ReplayState.PAUSED);
      this.onReplayCompleteHandlers.forEach(h => h());
    }
  }

  /** Greatest event index whose timestamp <= t (events are in sequence order). */
  private indexForTimestamp(t: number): number {
    let idx = -1;
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].authoritativeTimestamp <= t) idx = i;
    }
    return idx;
  }

  private applyNext() {
    const ev = this.events[this.cursor + 1];
    const r = applyEvent(this.current, ev);
    this.cursor++;
    for (const id of r.updated) { const e = this.current.entities[id]; if (e) this.onEntityUpdatedHandlers.forEach(h => h(e)); }
    for (const id of r.removed) this.onEntityRemovedHandlers.forEach(h => h(id));
  }

  private rebuildTo(index: number) {
    this.current = cloneReducedState(this.startState);
    this.cursor = -1;
    const end = Math.min(index, this.events.length - 1);
    for (let i = 0; i <= end; i++) { applyEvent(this.current, this.events[i]); this.cursor = i; }
    this.emitRefresh();
  }

  private stopTimer() {
    if (this.timer !== null) { this.scheduler.clearInterval(this.timer); this.timer = null; }
  }

  private setState(s: ReplayState) {
    if (this.state === s) return;
    this.state = s;
    this.onStateChangeHandlers.forEach(h => h(s));
  }

  private emitTime() { this.onTimeUpdateHandlers.forEach(h => h(this.currentTimestamp)); }
  private emitRefresh() { this.onRefreshHandlers.forEach(h => h()); }
}
