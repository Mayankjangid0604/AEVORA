'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Link from 'next/link';
import * as THREE from 'three';
import { ConnectionState, type WorldSnapshot, type WorldEntity } from '@aevora/shared';
import { useWorldState } from './useWorldState';
import { SpatialScene, CAMERA_PRESETS } from './SpatialScene';
import {
  AdaptivePerformanceProvider,
  useAdaptivePerformance,
  type QualityTier,
} from './AdaptivePerformanceController';
import { SpatialSearchModal } from './SpatialSearchModal';
import { AccessibleTwinView } from './AccessibleTwinView';

export interface SpatialViewportProps {
  companyId: string;
  companyName: string;
  initialSnapshot?: WorldSnapshot | null;
}

/**
 * Robust WebGL feature detector.
 */
function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

type DetailedEntity = WorldEntity & {
  parentId?: string;
  roomType?: string;
  employeeId?: string;
  isOccupied?: boolean;
  aevoraId?: string;
  departmentName?: string;
  roleTitle?: string;
  workspaceId?: string;
  currentActivity?: string;
  spatialState?: string;
  vehicleClass?: string;
  ownerId?: string;
  isParked?: boolean;
};

/**
 * Internal Viewport Component wrapped within the Performance Provider.
 */
function SpatialViewportInner({
  companyId,
  companyName,
  initialSnapshot,
}: SpatialViewportProps) {
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const webglAvailable = mounted ? isWebGLAvailable() : true;
  const [activePreset, setActivePreset] = useState<string>('overview');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isAccessibleOpen, setIsAccessibleOpen] = useState<boolean>(false);

  const { settings, metrics, setManualTier, selectedTierMode } = useAdaptivePerformance();

  const {
    connectionState,
    sequence,
    entities,
    selectedEntity,
    setSelectedEntity,
    reconnect,
    errorMessage,
  } = useWorldState({ companyId, initialSnapshot });
  const detailedEntity = (selectedEntity ?? {}) as DetailedEntity;

  // Keyboard shortcut listener for hybrid navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in text inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setIsAccessibleOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isSearchOpen) setIsSearchOpen(false);
        else if (isAccessibleOpen) setIsAccessibleOpen(false);
        else if (selectedEntity) setSelectedEntity(null);
      } else if (e.key === '1') {
        setActivePreset('overview');
      } else if (e.key === '2') {
        setActivePreset('executive');
      } else if (e.key === '3') {
        setActivePreset('main');
      } else if (e.key === '4') {
        setActivePreset('parking');
      } else if (e.key === '5') {
        setActivePreset('engineering');
      } else if (e.key === '6') {
        setActivePreset('fleet');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, isAccessibleOpen, selectedEntity, setSelectedEntity]);

  // Aggregate entity metrics
  const stats = useMemo(() => {
    let rooms = 0;
    let workspaces = 0;
    let persons = 0;
    let floors = 0;
    let vehicles = 0;

    entities.forEach((e) => {
      const type = e.type?.toUpperCase();
      if (type === 'ROOM' || type === 'OFFICE' || type === 'DEPARTMENT_SPACE' || type === 'MEETING_ROOM') rooms++;
      else if (type === 'WORKSPACE') workspaces++;
      else if (type === 'PERSON' || type === 'EMPLOYEE') persons++;
      else if (type === 'FLOOR') floors++;
      else if (type === 'VEHICLE') vehicles++;
    });

    return { rooms, workspaces, persons, floors, vehicles, total: entities.size };
  }, [entities]);

  // SSR Loading placeholder
  if (!mounted) {
    return (
      <div className="flex h-[80vh] w-full flex-col items-center justify-center rounded-xl border border-border bg-surface-1 p-8 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-text">Initializing 3D Spatial Canvas...</p>
        <p className="text-xs text-muted">Authoritative enterprise projection</p>
      </div>
    );
  }

  // Graceful WebGL failure fallback
  if (!webglAvailable || metrics.contextLost) {
    return (
      <div className="flex h-[80vh] w-full flex-col items-center justify-center rounded-xl border border-border bg-surface-1 p-8 text-center">
        <div className="rounded-full bg-amber-500/10 p-3 text-amber-500">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-text">
          {metrics.contextLost ? '3D Graphics Context Lost' : 'WebGL 3D Acceleration Unavailable'}
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          {metrics.contextLost
            ? 'The GPU process or WebGL context was interrupted. You can inspect all enterprise entities in the 2D Accessible Directory or reload.'
            : 'Your browser or device does not have WebGL hardware acceleration enabled. You can inspect all authoritative spatial entities in the 2D Directory.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => setIsAccessibleOpen(true)}
            className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Open 2D Accessible Directory
          </button>
          <Link
            href={`/company/${companyId}`}
            className="rounded-control border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            Return to 2D Company OS
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="rounded-control border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            Retry
          </button>
        </div>

        {/* Accessible directory fallback if WebGL is unavailable */}
        <AccessibleTwinView
          isOpen={isAccessibleOpen}
          onClose={() => setIsAccessibleOpen(false)}
          entities={entities}
          selectedEntity={selectedEntity}
          onSelectEntity={(e) => setSelectedEntity(e)}
        />
      </div>
    );
  }

  // Connection badge color
  const statusColor =
    connectionState === ConnectionState.STREAMING || connectionState === ConnectionState.SYNCHRONIZED
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : connectionState === ConnectionState.ERROR
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/30';

  return (
    <div className="relative flex h-[84vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl">
      {/* 3D WebGL Canvas */}
      <div className="relative h-full w-full">
        <Canvas
          shadows={settings.shadows}
          dpr={settings.dpr}
          camera={{ position: [38, 28, 48], fov: 42 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#030712'));
          }}
        >
          <Suspense fallback={null}>
            <SpatialScene
              entities={entities}
              selectedEntity={selectedEntity}
              onSelectEntity={setSelectedEntity}
              activePresetId={activePreset}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Top HUD Bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-b from-slate-950/90 via-slate-950/50 to-transparent">
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/90 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur-md">
            <span className="text-xs uppercase tracking-wider text-sky-400 font-mono font-semibold">
              AEVORA SPATIAL
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-sm font-semibold text-white">{companyName} HQ</span>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur-md ${statusColor}`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  connectionState === ConnectionState.STREAMING ? 'bg-emerald-400' : 'bg-transparent'
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  connectionState === ConnectionState.STREAMING ||
                  connectionState === ConnectionState.SYNCHRONIZED
                    ? 'bg-emerald-400'
                    : 'bg-amber-400'
                }`}
              />
            </span>
            <span>{connectionState}</span>
            <span className="ml-1 text-[11px] opacity-75 font-mono">#{sequence}</span>
          </div>
        </div>

        {/* Center: Camera Presets Navigation */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-slate-900/85 p-1 ring-1 ring-white/10 backdrop-blur-md">
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setActivePreset(preset.id);
                setSelectedEntity(null);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                activePreset === preset.id && !selectedEntity
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Right HUD Tools: Search, 2D Directory, Performance Tier, 2D OS Return */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Instant Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 backdrop-blur-md hover:bg-slate-800 hover:text-white"
            title="Search entities (Hot-key: /)"
          >
            <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Search</span>
            <kbd className="ml-1 rounded bg-slate-800 px-1 text-[10px] text-slate-400 border border-white/10">
              /
            </kbd>
          </button>

          {/* 2D Accessible Directory Drawer Toggle */}
          <button
            onClick={() => setIsAccessibleOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 backdrop-blur-md transition ${
              isAccessibleOpen
                ? 'bg-sky-600 text-white ring-sky-400'
                : 'bg-slate-900/85 text-slate-200 ring-white/10 hover:bg-slate-800 hover:text-white'
            }`}
            title="Toggle Accessible 2D Twin Directory (Hot-key: A)"
          >
            <span>2D Directory</span>
            <kbd className="ml-1 rounded bg-slate-800 px-1 text-[10px] text-slate-400 border border-white/10">
              A
            </kbd>
          </button>

          {/* Adaptive Quality Dropdown */}
          <div className="flex items-center rounded-lg bg-slate-900/85 px-2.5 py-1 text-xs ring-1 ring-white/10 backdrop-blur-md">
            <span className="mr-1.5 font-mono text-[10px] text-emerald-400 font-semibold">
              {metrics.fps} FPS
            </span>
            <span className="text-slate-600 mr-2">|</span>
            <select
              value={selectedTierMode}
              onChange={(e) => setManualTier(e.target.value as QualityTier | 'AUTO')}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="AUTO" className="bg-slate-900 text-white">Auto Quality ({metrics.activeTier})</option>
              <option value="CINEMATIC_ULTRA" className="bg-slate-900 text-white">Cinematic Ultra</option>
              <option value="BALANCED" className="bg-slate-900 text-white">Balanced</option>
              <option value="PERFORMANCE" className="bg-slate-900 text-white">Performance</option>
              <option value="BATTERY_SAVER" className="bg-slate-900 text-white">Battery Saver</option>
            </select>
          </div>

          {/* Return to 2D OS */}
          <Link
            href={`/company/${companyId}`}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 backdrop-blur-md hover:bg-slate-800 hover:text-white"
          >
            <span>2D OS</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </header>

      {/* Bottom HUD: Stats & Diagnostics */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-4 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent">
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 backdrop-blur-md">
          <span>{stats.floors} Floors</span>
          <span className="text-slate-600">•</span>
          <span>{stats.rooms} Rooms & Offices</span>
          <span className="text-slate-600">•</span>
          <span>{stats.workspaces} Workspaces</span>
          <span className="text-slate-600">•</span>
          <span>{stats.persons} Personnel</span>
          <span className="text-slate-600">•</span>
          <span>{stats.vehicles} Fleet</span>
        </div>

        {errorMessage && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-rose-950/90 px-3 py-1 text-xs text-rose-300 ring-1 ring-rose-500/30">
            <span>{errorMessage}</span>
            <button onClick={reconnect} className="underline hover:text-white">
              Reconnect
            </button>
          </div>
        )}

        <div className="pointer-events-auto text-[11px] text-slate-400 font-mono">
          Authoritative World State • Live Digital Twin
        </div>
      </footer>

      {/* Entity Inspector Side Panel */}
      {selectedEntity && (
        <aside className="pointer-events-auto absolute right-4 top-20 w-84 rounded-xl bg-slate-900/95 p-4 text-xs shadow-2xl ring-1 ring-white/15 backdrop-blur-lg">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-sky-400 font-mono font-semibold">
                {selectedEntity.type || 'ENTITY'}
              </span>
              <h3 className="text-sm font-semibold text-white truncate max-w-[200px]">
                {selectedEntity.name || selectedEntity.id}
              </h3>
            </div>
            <button
              onClick={() => setSelectedEntity(null)}
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-2 text-slate-300">
            <div>
              <span className="text-slate-500">Entity ID:</span>
                  <p className="font-mono text-[11px] text-slate-200 truncate">{selectedEntity.id}</p>
                </div>

                {selectedEntity.parentId && (
                  <div>
                    <span className="text-slate-500">Parent Scope:</span>
                    <p className="font-mono text-[11px] text-slate-300 truncate">{selectedEntity.parentId}</p>
                  </div>
                )}

                {detailedEntity.roomType && (
                  <div>
                    <span className="text-slate-500">Room Classification:</span>
                    <p className="font-medium text-sky-300">{detailedEntity.roomType}</p>
                  </div>
                )}

                {detailedEntity.employeeId && (
                  <div>
                    <span className="text-slate-500">Assigned Employee:</span>
                    <p className="font-mono text-[11px] text-emerald-300">{detailedEntity.employeeId}</p>
                  </div>
                )}

                {detailedEntity.isOccupied !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Occupancy:</span>
                    <span
                      className={`font-semibold ${
                        detailedEntity.isOccupied ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {detailedEntity.isOccupied ? 'Occupied' : 'Vacant'}
                    </span>
                  </div>
                )}

                {selectedEntity.type === 'PERSON' && (
                  <div className="space-y-2 border-t border-slate-700/60 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Employee ID:</span>
                      <span className="font-mono text-[11px] text-emerald-300 truncate max-w-[160px]">
                        {detailedEntity.aevoraId || selectedEntity.id.replace('v12_person_', '')}
                      </span>
                    </div>
                    {detailedEntity.departmentName && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Department:</span>
                        <span className="font-medium text-sky-300 truncate max-w-[160px]">
                          {detailedEntity.departmentName}
                        </span>
                      </div>
                    )}
                    {detailedEntity.roleTitle && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Role:</span>
                        <span className="font-medium text-amber-300 truncate max-w-[160px]">
                          {detailedEntity.roleTitle}
                        </span>
                      </div>
                    )}
                    {detailedEntity.workspaceId && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Assigned Desk:</span>
                        <span className="font-mono text-[11px] text-slate-300 truncate max-w-[160px]">
                          {detailedEntity.workspaceId}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Activity:</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                        {detailedEntity.currentActivity || 'WORKING'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Spatial State:</span>
                      <span className="font-semibold text-slate-300 text-xs">
                        {detailedEntity.spatialState || 'AT_WORKSPACE'}
                      </span>
                    </div>
                  </div>
                )}

                {selectedEntity.type === 'VEHICLE' && (
                  <div className="space-y-2 border-t border-slate-700/60 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Classification:</span>
                      <span className="font-semibold text-amber-300">
                        {detailedEntity.vehicleClass || 'STANDARD'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Fleet Status:</span>
                      <span className="font-medium text-emerald-300 truncate max-w-[160px]">
                        {detailedEntity.ownerId
                          ? `Assigned (${detailedEntity.ownerId.slice(0, 8)})`
                          : 'Enterprise Pool'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Operation:</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-800">
                        {detailedEntity.isParked ? 'PARKED' : 'IN_TRANSIT'}
                      </span>
                    </div>
                    {detailedEntity.parentId && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Parking Bay:</span>
                        <span className="font-mono text-[11px] text-slate-300 truncate max-w-[160px]">
                          {detailedEntity.parentId.replace('v12_parking_', '')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {selectedEntity.transform?.position && (
              <div>
                <span className="text-slate-500">Spatial Coordinates:</span>
                <p className="font-mono text-[11px] text-slate-300">
                  X: {selectedEntity.transform.position.x?.toFixed(1) ?? 0} • Y:{' '}
                  {selectedEntity.transform.position.y?.toFixed(1) ?? 0} • Z:{' '}
                  {selectedEntity.transform.position.z?.toFixed(1) ?? 0}
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Instant Entity Search Modal */}
      <SpatialSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        entities={entities}
        onSelectEntity={(e) => setSelectedEntity(e)}
      />

      {/* Accessible 2D Twin Directory Drawer */}
      <AccessibleTwinView
        isOpen={isAccessibleOpen}
        onClose={() => setIsAccessibleOpen(false)}
        entities={entities}
        selectedEntity={selectedEntity}
        onSelectEntity={(e) => setSelectedEntity(e)}
      />
    </div>
  );
}

/**
 * Spatial Viewport root wrapping the Performance Provider.
 */
export function SpatialViewport(props: SpatialViewportProps) {
  return (
    <AdaptivePerformanceProvider>
      <SpatialViewportInner {...props} />
    </AdaptivePerformanceProvider>
  );
}
