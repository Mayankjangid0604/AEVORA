import { WorldSnapshot, WorldEntity, V12EntityId } from './world-state';
import { V12EventEnvelope } from './events';

/**
 * Distinguishes where a world-state answer came from.
 * - CURRENT: the live authoritative projection right now.
 * - HISTORICAL: deterministically reconstructed from persisted spatial history (baseline + events).
 * - NOT_AVAILABLE: history cannot truthfully reconstruct the requested point. Never substituted with CURRENT.
 */
export type HistoricalStateStatus = 'CURRENT' | 'HISTORICAL' | 'NOT_AVAILABLE';

export enum HistoryNotAvailableReason {
  /** No WORLD_BASELINE at or before the target, so absolute state is unknown. */
  NO_BASELINE_BEFORE_TARGET = 'NO_BASELINE_BEFORE_TARGET',
  /** No persisted history at or before the requested timestamp. */
  NO_HISTORY_BEFORE_TARGET = 'NO_HISTORY_BEFORE_TARGET',
  /** Requested eventId does not exist in this company's history. */
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  /** Requested sequence is beyond the last persisted sequence. */
  SEQUENCE_NOT_FOUND = 'SEQUENCE_NOT_FOUND',
  /** A sequence gap (e.g. failed persistence) lies between the baseline and the target. */
  HISTORY_GAP = 'HISTORY_GAP',
  /** Reconstruction would need more events than the bounded query limit allows. */
  WINDOW_TOO_LARGE = 'WINDOW_TOO_LARGE',
  /** Target is older than the spatial-history retention boundary. */
  BEYOND_RETENTION = 'BEYOND_RETENTION',
  /** Target is in the future. */
  FUTURE_TARGET = 'FUTURE_TARGET',
  /** The entity does not exist in the reconstructed state at the target. */
  ENTITY_NOT_PRESENT_AT_TARGET = 'ENTITY_NOT_PRESENT_AT_TARGET',
  /** Spatial-history storage could not be queried. */
  HISTORY_STORE_UNAVAILABLE = 'HISTORY_STORE_UNAVAILABLE',
}

export interface HistoryTarget {
  timestamp?: number;
  sequence?: number;
  eventId?: string;
}

export interface ReconstructionProvenance {
  baselineEventId: string;
  baselineSequence: number;
  baselineTimestamp: number;
  appliedEventCount: number;
  targetSequence: number;
  /** Timestamp of the last applied event (or baseline if none applied). */
  lastAppliedTimestamp: number;
  /**
   * Entities that exist in history but whose full spatial definition (transform/visibility)
   * was never recorded. They must not be rendered with invented positions.
   */
  partialEntityIds: V12EntityId[];
}

export interface WorldStateQueryResult {
  status: HistoricalStateStatus;
  reason?: HistoryNotAvailableReason;
  message?: string;
  snapshot?: WorldSnapshot;
  provenance?: ReconstructionProvenance;
}

export interface HistoricalEntityResult {
  status: HistoricalStateStatus;
  reason?: HistoryNotAvailableReason;
  message?: string;
  entity?: WorldEntity;
  partial?: boolean;
  provenance?: ReconstructionProvenance;
}

export interface HistoryEventsPage {
  status: 'OK' | 'NOT_AVAILABLE';
  reason?: HistoryNotAvailableReason;
  message?: string;
  events: V12EventEnvelope[];
  /** True when more events matched than the bounded limit returned. */
  truncated: boolean;
  /** Pass as fromSequence (exclusive) to fetch the next page. */
  nextAfterSequence?: number;
  limit: number;
}

/** Everything a replay engine needs to deterministically play a window. */
export interface ReplayWindow {
  status: 'OK' | 'NOT_AVAILABLE';
  reason?: HistoryNotAvailableReason;
  message?: string;
  /** Reconstructed state at the start of the window. */
  startState?: WorldSnapshot;
  startProvenance?: ReconstructionProvenance;
  /** Events after startState.sequence, ordered by sequence, up to the window end. */
  events: V12EventEnvelope[];
  requestedFrom: number;
  requestedTo: number;
  /** Equals requestedFrom unless history only becomes reconstructable later in the window. */
  effectiveFrom?: number;
  truncated: boolean;
}

export interface EventTraceResult {
  status: 'OK' | 'NOT_AVAILABLE';
  reason?: HistoryNotAvailableReason;
  event?: V12EventEnvelope;
  /** Causation chain, nearest cause first. Only events that exist in spatial history. */
  causes: V12EventEnvelope[];
  /**
   * A causationId that does not resolve to a spatial history event (e.g. an authoritative
   * CompanyEvent id). Reported as-is; no relationship is invented beyond it.
   */
  unresolvedCausationId?: string;
  /** Events whose causationId is this event. */
  effects: V12EventEnvelope[];
  /** Events sharing this event's correlationId (excluding itself). */
  correlated: V12EventEnvelope[];
  truncated: boolean;
}

export interface ReplaySessionInfo {
  active: boolean;
  companyId?: string;
  startedAt?: number;
  expiresAt?: number;
}

export const REPLAY_READ_ONLY = 'REPLAY_READ_ONLY' as const;
