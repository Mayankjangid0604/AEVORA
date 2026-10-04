'use client';

import React from 'react';
import { EventTraceResult, MovementState, V12EventEnvelope, WorldEntity } from '@aevora/shared';
import styles from './replay.module.css';
import { describeReason } from './ReplayTimeline';

export interface HistoricalInspectorProps {
  selectedEntityId: string | null;
  /** Resolved exclusively from the replay engine's reconstructed state. */
  entity: WorldEntity | undefined;
  partial: boolean;
  movement: MovementState | undefined;
  timestamp: number;
  sequence: number;
  available: boolean;
  trace: { loading: boolean; error?: string; result?: EventTraceResult } | null;
  onCloseTrace: () => void;
  onJumpToEvent: (eventId: string) => void;
}

const fmt = (t?: number) => (t ? new Date(t).toLocaleString(undefined, { hour12: false }) : '\u2014');
const vec = (v: any) => (v && typeof v.x === 'number' ? `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}` : 'not recorded');

function EventLine({ e, onJump }: { e: V12EventEnvelope; onJump: (id: string) => void }) {
  return (
    <div className={styles.event} style={{ gridTemplateColumns: '52px 1fr auto' }} onClick={() => onJump(e.eventId)} title={e.eventId}>
      <span className={styles.mono}>#{e.sequence}</span>
      <span>{e.eventType} · {e.entityId}</span>
      <span className={styles.muted}>{new Date(e.authoritativeTimestamp).toLocaleTimeString(undefined, { hour12: false })}</span>
    </div>
  );
}

export function HistoricalInspector(p: HistoricalInspectorProps) {
  if (!p.selectedEntityId && !p.trace) return null;
  const e: any = p.entity;

  return (
    <aside className={styles.inspector} id="historical-inspector" aria-label="Historical entity inspection">
      {p.selectedEntityId && (
        <>
          <div className={`${styles.row} ${styles.spread}`}>
            <span className={styles.badge}>Historical state</span>
            <span className={styles.muted}>seq {p.sequence} · {fmt(p.timestamp)}</span>
          </div>
          {!p.available ? (
            <div className={`${styles.banner} ${styles.bannerWarn}`} style={{ marginTop: 8 }} id="inspector-not-available">
              NOT AVAILABLE. No reconstructed history is loaded for this point.
            </div>
          ) : !e ? (
            <div className={`${styles.banner} ${styles.bannerWarn}`} style={{ marginTop: 8 }} id="inspector-not-present">
              {describeReason('ENTITY_NOT_PRESENT_AT_TARGET')} <span className={styles.mono}>({p.selectedEntityId})</span>
            </div>
          ) : (
            <>
              <h3 style={{ margin: '10px 0 0', fontSize: 15, color: '#f9fafb' }}>{e.name ?? 'Unnamed (name not recorded)'}</h3>
              <div className={styles.kv}>
                <span className={styles.k}>Entity</span><span className={`${styles.v} ${styles.mono}`}>{e.id}</span>
                <span className={styles.k}>Type</span><span className={styles.v}>{e.type ?? 'not recorded'}</span>
                {e.aevoraId && (<><span className={styles.k}>Aevora ID</span><span className={`${styles.v} ${styles.mono}`}>{e.aevoraId}</span></>)}
                {e.aevoraType && (<><span className={styles.k}>Aevora type</span><span className={styles.v}>{e.aevoraType}</span></>)}
                {e.parentId && (<><span className={styles.k}>Parent</span><span className={`${styles.v} ${styles.mono}`}>{e.parentId}</span></>)}
                <span className={styles.k}>Position</span><span className={styles.v}>{vec(e.transform?.position)}</span>
                <span className={styles.k}>Visible</span><span className={styles.v}>{typeof e.visibility?.isVisible === 'boolean' ? String(e.visibility.isVisible) : 'not recorded'}</span>
                {p.movement && (<><span className={styles.k}>Movement</span><span className={styles.v}>{(p.movement as any).movementState ?? 'recorded'}{(p.movement as any).blockedReason ? ` (${(p.movement as any).blockedReason})` : ''}</span></>)}
              </div>
              {p.partial && (
                <div className={`${styles.banner} ${styles.bannerInfo}`} style={{ marginTop: 8 }} id="inspector-partial">
                  The recorded history for this entity has no complete transform/visibility, so it is not placed in the scene.
                </div>
              )}
            </>
          )}
        </>
      )}

      {p.trace && (
        <div className={p.selectedEntityId ? styles.section : ''} id="historical-trace">
          <div className={`${styles.row} ${styles.spread}`}>
            <p className={styles.h}>Correlation / causation</p>
            <button className={styles.btn} style={{ padding: '1px 8px', fontSize: 10 }} onClick={p.onCloseTrace}>close</button>
          </div>
          {p.trace.loading && <div className={styles.muted}>Tracing…</div>}
          {p.trace.error && <div className={`${styles.banner} ${styles.bannerErr}`}>{p.trace.error}</div>}
          {p.trace.result && p.trace.result.status === 'NOT_AVAILABLE' && (
            <div className={`${styles.banner} ${styles.bannerWarn}`}>{describeReason(p.trace.result.reason as string)}</div>
          )}
          {p.trace.result && p.trace.result.status === 'OK' && p.trace.result.event && (
            <>
              <EventLine e={p.trace.result.event} onJump={p.onJumpToEvent} />
              <div className={styles.kv}>
                <span className={styles.k}>Correlation</span><span className={`${styles.v} ${styles.mono}`}>{p.trace.result.event.correlationId ?? 'none recorded'}</span>
                <span className={styles.k}>Causation</span><span className={`${styles.v} ${styles.mono}`}>{p.trace.result.event.causationId ?? 'none recorded'}</span>
              </div>
              <p className={styles.h} style={{ marginTop: 10 }}>Caused by ({p.trace.result.causes.length})</p>
              {p.trace.result.causes.map((c) => <EventLine key={c.eventId} e={c} onJump={p.onJumpToEvent} />)}
              {p.trace.result.unresolvedCausationId && (
                <div className={styles.muted}>Cause <span className={styles.mono}>{p.trace.result.unresolvedCausationId}</span> is not in spatial history (not a spatial event, or beyond retention).</div>
              )}
              <p className={styles.h} style={{ marginTop: 10 }}>Effects ({p.trace.result.effects.length})</p>
              {p.trace.result.effects.map((c) => <EventLine key={c.eventId} e={c} onJump={p.onJumpToEvent} />)}
              <p className={styles.h} style={{ marginTop: 10 }}>Same correlation ({p.trace.result.correlated.length})</p>
              {p.trace.result.correlated.map((c) => <EventLine key={c.eventId} e={c} onJump={p.onJumpToEvent} />)}
              {p.trace.result.truncated && <div className={styles.muted}>List truncated at the server limit.</div>}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
