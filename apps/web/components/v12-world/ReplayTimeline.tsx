'use client';

import React, { useMemo, useState } from 'react';
import { REPLAY_SPEEDS, ReplayState, V12EventEnvelope, WorldStateReplayEngine, ReplayAvailability } from '@aevora/shared';
import styles from './replay.module.css';

export const REPLAY_WINDOWS = [
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
] as const;

const REASON_TEXT: Record<string, string> = {
  NO_BASELINE_BEFORE_TARGET: 'No world baseline was recorded before this point, so the absolute world state is unknown.',
  NO_HISTORY_BEFORE_TARGET: 'No spatial history was recorded before this point.',
  EVENT_NOT_FOUND: 'That event is not in this company\u2019s spatial history.',
  SEQUENCE_NOT_FOUND: 'That sequence is not in this company\u2019s spatial history.',
  HISTORY_GAP: 'Spatial history has a gap here; state cannot be reconstructed truthfully.',
  WINDOW_TOO_LARGE: 'Too many events to reconstruct this point within the configured limit.',
  BEYOND_RETENTION: 'This point is older than the spatial-history retention period.',
  FUTURE_TARGET: 'The requested window is in the future or empty.',
  ENTITY_NOT_PRESENT_AT_TARGET: 'The entity did not exist at this point.',
  HISTORY_STORE_UNAVAILABLE: 'The spatial-history store could not be reached.',
};

export function describeReason(reason?: string, message?: string): string {
  return (reason && REASON_TEXT[reason]) || message || 'Historical state is not available.';
}

const fmt = (t: number) => (t ? new Date(t).toLocaleString(undefined, { hour12: false }) : '\u2014');
const toLocalInput = (t: number) => {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export interface ReplayTimelineProps {
  engine: WorldStateReplayEngine;
  replayState: ReplayState;
  timestamp: number;
  availability: ReplayAvailability;
  events: readonly V12EventEnvelope[];
  cursor: number;
  range: { min: number; max: number };
  speed: number;
  windowMs: number;
  onSelectWindow: (ms: number) => void;
  onTraceEvent: (eventId: string) => void;
}

export function ReplayTimeline(p: ReplayTimelineProps) {
  const { engine, replayState, timestamp, availability, events, cursor, range } = p;
  const [jumpTime, setJumpTime] = useState('');
  const [jumpEvent, setJumpEvent] = useState('');
  const [jumpError, setJumpError] = useState<string | null>(null);

  const loaded = availability.status === 'AVAILABLE';
  const span = Math.max(1, range.max - range.min);
  const currentEvent = cursor >= 0 ? events[cursor] : null;

  // Only render a bounded number of tick marks; the event list remains complete.
  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(events.length / 400));
    return events.filter((_, i) => i % step === 0).map((e) => ({ id: e.eventId, seq: e.sequence, left: ((e.authoritativeTimestamp - range.min) / span) * 100 }));
  }, [events, range.min, span]);

  // Event list: a bounded slice around the cursor.
  const listStart = Math.max(0, cursor - 30);
  const listed = events.slice(listStart, listStart + 80);

  const doJumpTime = () => {
    setJumpError(null);
    const t = new Date(jumpTime).getTime();
    if (!Number.isFinite(t)) return setJumpError('Enter a valid date and time.');
    if (t < range.min || t > range.max) return setJumpError('That time is outside the loaded replay window. Load a larger window first.');
    engine.jumpToTimestamp(t);
  };

  const doJumpEvent = () => {
    setJumpError(null);
    const q = jumpEvent.trim();
    if (!q) return;
    const ok = /^\d+$/.test(q) ? engine.jumpToSequence(Number(q)) : engine.jumpToEvent(q);
    if (!ok) setJumpError(`Event ${q} is not in the loaded replay window.`);
  };

  const stateBadge =
    replayState === ReplayState.NOT_AVAILABLE ? styles.badgeWarn : replayState === ReplayState.ERROR ? styles.badgeErr : '';

  return (
    <section className={styles.panel} id="replay-timeline" aria-label="Historical replay timeline">
      <div className={`${styles.row} ${styles.spread}`}>
        <div className={styles.row}>
          <span className={styles.badge}>Historical replay</span>
          <span className={`${styles.badge} ${stateBadge}`} id="replay-state">{replayState}</span>
          <span className={styles.clock} id="replay-clock">{fmt(timestamp)}</span>
          {loaded && <span className={styles.muted}>seq {engine.getCurrentSequence()} · event {cursor + 1}/{events.length}</span>}
        </div>
        <div className={styles.row} role="group" aria-label="Replay window">
          {REPLAY_WINDOWS.map((w) => (
            <button
              key={w.label}
              id={`replay-window-${w.label}`}
              className={`${styles.btn} ${p.windowMs === w.ms ? styles.btnActive : ''}`}
              onClick={() => p.onSelectWindow(w.ms)}
              disabled={replayState === ReplayState.BUFFERING}
            >
              Last {w.label}
            </button>
          ))}
        </div>
      </div>

      {availability.status === 'NOT_AVAILABLE' && (
        <div className={`${styles.banner} ${styles.bannerWarn}`} id="replay-not-available" role="status">
          <strong>NOT AVAILABLE</strong> · {describeReason(availability.reason as string, availability.message)}
          {availability.reason && <span className={`${styles.muted} ${styles.mono}`}> ({availability.reason})</span>}
          <div className={styles.muted}>Nothing is shown rather than substituting current or invented state.</div>
        </div>
      )}
      {availability.status === 'ERROR' && (
        <div className={`${styles.banner} ${styles.bannerErr}`} id="replay-error" role="alert">
          Replay could not be loaded: {availability.message}
        </div>
      )}
      {loaded && (availability.truncated || (availability.effectiveFrom && availability.requestedFrom && availability.effectiveFrom > availability.requestedFrom)) && (
        <div className={`${styles.banner} ${styles.bannerInfo}`} id="replay-window-notice">
          {availability.effectiveFrom && availability.requestedFrom && availability.effectiveFrom > availability.requestedFrom && (
            <div>History is reconstructable only from {fmt(availability.effectiveFrom)} (first recorded baseline in this window).</div>
          )}
          {availability.truncated && <div>The window ends early (event limit or history gap); later events are not replayed.</div>}
        </div>
      )}

      <div className={styles.timeline}>
        <div className={styles.ticks} aria-hidden>
          {ticks.map((t) => (
            <span key={t.id} className={`${styles.tick} ${currentEvent && t.seq <= currentEvent.sequence ? styles.tickApplied : ''}`} style={{ left: `${t.left}%` }} />
          ))}
        </div>
        <input
          id="replay-seek"
          aria-label="Seek"
          className={styles.range}
          type="range"
          min={range.min}
          max={range.max}
          step={1}
          value={Math.min(Math.max(timestamp, range.min), range.max)}
          disabled={!loaded}
          onChange={(e) => engine.seek(Number(e.target.value))}
        />
      </div>
      <div className={`${styles.row} ${styles.spread}`}>
        <span className={styles.muted}>{fmt(range.min)}</span>
        <span className={styles.muted}>{fmt(range.max)}</span>
      </div>

      <div className={`${styles.row} ${styles.spread}`}>
        <div className={styles.row} role="group" aria-label="Transport">
          <button id="replay-reset" className={styles.btn} disabled={!loaded} onClick={() => engine.reset()} title="Reset to window start">⏮</button>
          <button id="replay-step-back" className={styles.btn} disabled={!loaded || cursor < 0} onClick={() => engine.stepBackward()} title="Previous event">◀︎ Step</button>
          {replayState === ReplayState.PLAYING ? (
            <button id="replay-pause" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => engine.pause()}>❚❚ Pause</button>
          ) : (
            <button id="replay-play" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!loaded} onClick={() => engine.play()}>▶ Play</button>
          )}
          <button id="replay-step-forward" className={styles.btn} disabled={!loaded || cursor >= events.length - 1} onClick={() => engine.stepForward()} title="Next event">Step ▶︎</button>
          <button id="replay-stop" className={styles.btn} disabled={!loaded} onClick={() => engine.stop()}>■ Stop</button>
          <label className={styles.muted} htmlFor="replay-speed">Speed</label>
          <select id="replay-speed" className={styles.select} value={p.speed} onChange={(e) => engine.setSpeed(Number(e.target.value))}>
            {REPLAY_SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
        <div className={styles.row}>
          <input id="replay-jump-time" aria-label="Jump to time" className={styles.input} type="datetime-local" step={1}
            value={jumpTime || toLocalInput(timestamp)} onChange={(e) => setJumpTime(e.target.value)} disabled={!loaded} />
          <button id="replay-jump-time-go" className={styles.btn} disabled={!loaded} onClick={doJumpTime}>Go to time</button>
          <input id="replay-jump-event" aria-label="Jump to event id or sequence" className={styles.input} style={{ width: 150 }}
            placeholder="event id or sequence" value={jumpEvent} onChange={(e) => setJumpEvent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doJumpEvent()} disabled={!loaded} />
          <button id="replay-jump-event-go" className={styles.btn} disabled={!loaded} onClick={doJumpEvent}>Go to event</button>
        </div>
      </div>
      {jumpError && <div className={`${styles.banner} ${styles.bannerWarn}`} id="replay-jump-error">{jumpError}</div>}

      {loaded && (
        <div className={styles.muted} id="replay-provenance">
          Reconstructed from baseline {availability.provenance?.baselineEventId?.slice(0, 8) ?? '\u2014'} at {fmt(availability.provenance?.baselineTimestamp ?? 0)}
          {' '}+ {availability.provenance?.appliedEventCount ?? 0} events to window start
          {engine.getPartialEntityIds().length > 0 && <> · {engine.getPartialEntityIds().length} entities have incomplete spatial history and are not rendered</>}
        </div>
      )}

      {loaded && events.length > 0 && (
        <div className={styles.events} id="replay-event-list" role="list">
          {listed.map((e, i) => {
            const idx = listStart + i;
            return (
              <div
                key={e.eventId}
                role="listitem"
                className={`${styles.event} ${idx === cursor ? styles.eventCurrent : ''} ${idx > cursor ? styles.eventFuture : ''}`}
                onClick={() => engine.jumpToEvent(e.eventId)}
                title={e.eventId}
              >
                <span className={styles.mono}>#{e.sequence}</span>
                <span className={styles.mono}>{new Date(e.authoritativeTimestamp).toLocaleTimeString(undefined, { hour12: false })}</span>
                <span>{e.eventType} · {e.entityId}</span>
                <button className={styles.btn} style={{ padding: '1px 7px', fontSize: 10 }}
                  onClick={(ev) => { ev.stopPropagation(); p.onTraceEvent(e.eventId); }}>trace</button>
              </div>
            );
          })}
        </div>
      )}
      {loaded && events.length === 0 && <div className={styles.muted}>No spatial events were recorded in this window after the start state.</div>}
    </section>
  );
}
