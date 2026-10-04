'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WorldStateConsumer, ConnectionState, WorldEntity, TopologyEdge, NavigationNode, MovementState, WorldMode,
  WorldStateReplayEngine, ReplayState, ReplayAvailability, V12EventEnvelope, EventTraceResult,
} from '@aevora/shared';
import { WorldRenderer } from './WorldRenderer';
import { UIOverlay } from './UIOverlay';
import { ExecutiveVoice } from './ExecutiveVoice';
import { ReplayTimeline, REPLAY_WINDOWS } from './ReplayTimeline';
import { HistoricalInspector } from './HistoricalInspector';
import { enterReplaySession, exitReplaySession, fetchStreamToken, resolveWorldContext, traceHistoricalEvent } from './worldContext';
import styles from './replay.module.css';

type ViewMode = 'overhead' | 'first-person' | 'explore' | 'vehicle-exterior' | 'vehicle-interior' | 'route-overview' | 'third-person' | 'follow' | 'executive-focus';

/**
 * LIVE:   WorldStateConsumer (snapshot + SSE)        → rendered world
 * REPLAY: WorldStateReplayEngine (history window)     → rendered world
 * Exactly one source is active; each mode owns a fresh instance that is torn down on exit, and the
 * rendered state is cleared on every switch so neither mode can show the other's data.
 */
export function WorldViewer() {
  const [ctx] = useState(() => resolveWorldContext());
  const companyId = ctx.companyId;

  const [worldMode, setWorldMode] = useState<WorldMode>(WorldMode.LIVE);
  const [switching, setSwitching] = useState(false);

  // Rendered world (from whichever source is active)
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [topology, setTopology] = useState<TopologyEdge[]>([]);
  const [nodes, setNodes] = useState<NavigationNode[]>([]);
  const [movementStates, setMovementStates] = useState<Map<string, MovementState>>(new Map());

  // LIVE
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);

  // REPLAY
  const [engine, setEngine] = useState<WorldStateReplayEngine | null>(null);
  const [replayState, setReplayState] = useState<ReplayState>(ReplayState.STOPPED);
  const [timestamp, setTimestamp] = useState(0);
  const [availability, setAvailability] = useState<ReplayAvailability>({ status: 'UNLOADED' });
  const [events, setEvents] = useState<readonly V12EventEnvelope[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [sequence, setSequence] = useState(0);
  const [range, setRange] = useState({ min: 0, max: 0 });
  const [speed, setSpeed] = useState(1);
  const [windowMs, setWindowMs] = useState<number>(REPLAY_WINDOWS[1].ms);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ loading: boolean; error?: string; result?: EventTraceResult } | null>(null);
  const [replayVersion, setReplayVersion] = useState(0);

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overhead');
  const [showDebug, setShowDebug] = useState(false);

  const clearWorld = useCallback(() => {
    setEntities([]); setTopology([]); setNodes([]); setMovementStates(new Map()); setSelectedEntityId(null); setTrace(null);
  }, []);

  // ---------------------------------------------------------------- LIVE
  useEffect(() => {
    if (worldMode !== WorldMode.LIVE || !companyId) return;
    clearWorld();
    const consumer = new WorldStateConsumer({
      companyId,
      apiBaseUrl: ctx.apiBaseUrl,
      headers: ctx.headers,
      streamTokenProvider: fetchStreamToken,
    });
    let active = true;
    const sync = () => {
      if (!active) return;
      setEntities(Array.from(consumer.getEntities().values()));
      setTopology(consumer.getTopology());
      setNodes(consumer.getNavigationNodes());
      setMovementStates(new Map(consumer.getMovementStates()));
    };
    consumer.onStateChange((state) => {
      if (!active) return;
      setConnectionState(state);
      if (state === ConnectionState.SYNCHRONIZED || state === ConnectionState.STREAMING || state === ConnectionState.DEGRADED) sync();
    });
    consumer.onEntityUpdated(sync);
    consumer.onEntityRemoved(sync);
    consumer.connect();
    return () => {
      active = false;
      consumer.disconnect();
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [worldMode, companyId, ctx, clearWorld]);

  // ---------------------------------------------------------------- REPLAY session + engine
  useEffect(() => {
    if (worldMode !== WorldMode.REPLAY || !companyId) return;
    clearWorld();
    const replay = new WorldStateReplayEngine({ companyId, apiBaseUrl: ctx.apiBaseUrl, headers: ctx.headers });
    let active = true;

    const sync = () => {
      if (!active) return;
      // Entities without a recorded transform/visibility are never placed in the scene (no invented positions).
      setEntities(Array.from(replay.getEntities().values()).filter((e) => !replay.isPartialEntity(e.id)));
      setTopology(replay.getTopology());
      setNodes(replay.getNavigationNodes());
      setMovementStates(replay.getMovementStates());
      setEvents(replay.getEvents());
      setCursor(replay.getCursor());
      setSequence(replay.getCurrentSequence());
      setAvailability(replay.getAvailability());
      setRange(replay.getTimelineRange());
      setSpeed(replay.getSpeed());
      setReplayVersion((v) => v + 1);
    };
    replay.onRefresh(sync);
    replay.onStateChange((s) => { if (active) { setReplayState(s); setSpeed(replay.getSpeed()); } });
    replay.onTimeUpdate((t) => { if (active) { setTimestamp(t); setCursor(replay.getCursor()); setSequence(replay.getCurrentSequence()); } });

    setSessionWarning(null);
    // Server-side replay session: the backend rejects consequential commands for this actor while it is active.
    enterReplaySession(companyId).then((r) => {
      if (active && r.error) setSessionWarning(`Replay session could not be registered (${r.error}). Commands remain blocked client-side and by the REPLAY mode flag.`);
    });
    setEngine(replay);

    return () => {
      active = false;
      replay.dispose();
      setEngine(null);
      setAvailability({ status: 'UNLOADED' });
      setEvents([]); setCursor(-1); setReplayState(ReplayState.STOPPED);
      exitReplaySession(companyId);
    };
  }, [worldMode, companyId, ctx, clearWorld]);

  // Load / reload the replay window
  useEffect(() => {
    if (!engine) return;
    const to = Date.now();
    engine.loadWindow(to - windowMs, to);
  }, [engine, windowMs]);

  const switchMode = async (mode: WorldMode) => {
    if (mode === worldMode || switching) return;
    setSwitching(true);
    setWorldMode(mode);
    setTimeout(() => setSwitching(false), 300);
  };

  const onTraceEvent = useCallback(async (eventId: string) => {
    if (!companyId) return;
    setTrace({ loading: true });
    const r = await traceHistoricalEvent(companyId, eventId);
    setTrace(r.error ? { loading: false, error: r.error } : { loading: false, result: r.data as EventTraceResult });
  }, [companyId]);

  // Selected entity: LIVE → live list; REPLAY → reconstructed historical state only (no fallback).
  const historicalEntity = useMemo(
    () => (worldMode === WorldMode.REPLAY && engine && selectedEntityId ? engine.getEntity(selectedEntityId) : undefined),
    // replayVersion changes whenever the replay position changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [worldMode, engine, selectedEntityId, replayVersion, cursor],
  );
  const liveSelected = worldMode === WorldMode.LIVE ? entities.find((e) => e.id === selectedEntityId) || null : null;

  const getHistoricalEntity = useCallback(
    (id: string) => (engine ? { entity: engine.getEntity(id), partial: engine.isPartialEntity(id), available: engine.isLoaded() } : { entity: undefined, partial: false, available: false }),
    [engine],
  );

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#0a0a0a', overflow: 'hidden' }}>
      <div className={styles.modeSwitch} role="group" aria-label="World mode">
        <button id="world-mode-live" className={`${styles.modeBtn} ${worldMode === WorldMode.LIVE ? styles.modeLive : ''}`}
          disabled={switching} aria-pressed={worldMode === WorldMode.LIVE} onClick={() => switchMode(WorldMode.LIVE)}>
          <span className={`${styles.dot} ${worldMode === WorldMode.LIVE ? styles.pulse : ''}`} /> LIVE
        </button>
        <button id="world-mode-replay" className={`${styles.modeBtn} ${worldMode === WorldMode.REPLAY ? styles.modeReplay : ''}`}
          disabled={switching || !companyId} aria-pressed={worldMode === WorldMode.REPLAY} onClick={() => switchMode(WorldMode.REPLAY)}>
          ⟲ REPLAY
        </button>
      </div>

      {!companyId && (
        <div className={styles.empty}>
          <div className={styles.emptyCard} id="world-no-company">
            <strong>No company selected.</strong>
            <div className={styles.muted} style={{ marginTop: 6 }}>Choose a company in the Chairman console. The world only shows data for your authorised company scope.</div>
          </div>
        </div>
      )}

      {worldMode === WorldMode.REPLAY && engine && (
        <>
          <ReplayTimeline
            engine={engine}
            replayState={replayState}
            timestamp={timestamp}
            availability={availability}
            events={events}
            cursor={cursor}
            range={range}
            speed={speed}
            windowMs={windowMs}
            onSelectWindow={setWindowMs}
            onTraceEvent={onTraceEvent}
          />
          <HistoricalInspector
            selectedEntityId={selectedEntityId || null}
            entity={historicalEntity}
            partial={!!(selectedEntityId && engine.isPartialEntity(selectedEntityId))}
            movement={selectedEntityId ? movementStates.get(selectedEntityId) : undefined}
            timestamp={timestamp}
            sequence={sequence}
            available={availability.status === 'AVAILABLE'}
            trace={trace}
            onCloseTrace={() => setTrace(null)}
            onJumpToEvent={(id) => engine.jumpToEvent(id)}
          />
          {sessionWarning && (
            <div className={`${styles.banner} ${styles.bannerWarn}`} style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 105 }}>
              {sessionWarning}
            </div>
          )}
        </>
      )}

      <UIOverlay
        connectionState={connectionState}
        selectedEntity={liveSelected}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showDebug={showDebug}
        setShowDebug={setShowDebug}
      />

      <WorldRenderer
        entities={entities}
        topology={topology}
        nodes={nodes}
        movementStates={movementStates}
        viewMode={viewMode}
        showDebug={showDebug}
        selectedEntityId={selectedEntityId}
        onSelectEntity={(id) => setSelectedEntityId(id || null)}
      />

      <ExecutiveVoice
        entities={entities}
        selectedEntityId={selectedEntityId}
        onSelectEntity={setSelectedEntityId}
        viewMode={viewMode}
        setViewMode={setViewMode}
        worldMode={worldMode}
        companyId={companyId}
        getHistoricalEntity={getHistoricalEntity}
      />
    </div>
  );
}
