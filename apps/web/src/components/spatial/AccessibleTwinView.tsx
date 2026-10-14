'use client';

import React, { useState, useMemo } from 'react';
import type { WorldEntity, V12EntityId } from '@aevora/shared';

export interface AccessibleTwinViewProps {
  isOpen: boolean;
  onClose: () => void;
  entities: Map<V12EntityId, WorldEntity>;
  selectedEntity: WorldEntity | null;
  onSelectEntity: (entity: WorldEntity) => void;
}

export type TwinTab = 'PERSON' | 'ROOM' | 'WORKSPACE' | 'VEHICLE';

type DetailedTwinEntity = WorldEntity & {
  roleTitle?: string;
  roomType?: string;
  vehicleClass?: string;
  departmentName?: string;
  currentActivity?: string;
  isOccupied?: boolean;
  isParked?: boolean;
};

export function AccessibleTwinView({
  isOpen,
  onClose,
  entities,
  selectedEntity,
  onSelectEntity,
}: AccessibleTwinViewProps) {
  const [activeTab, setActiveTab] = useState<TwinTab>('PERSON');
  const [searchFilter, setSearchFilter] = useState('');

  // Partition entities by category
  const { persons, rooms, workspaces, vehicles } = useMemo(() => {
    const p: WorldEntity[] = [];
    const r: WorldEntity[] = [];
    const w: WorldEntity[] = [];
    const v: WorldEntity[] = [];

    entities.forEach((entity) => {
      const type = (entity.type || '').toUpperCase();
      if (type === 'PERSON' || type === 'EMPLOYEE') p.push(entity);
      else if (type === 'ROOM' || type === 'OFFICE' || type === 'MEETING_ROOM' || type === 'DEPARTMENT_SPACE') r.push(entity);
      else if (type === 'WORKSPACE') w.push(entity);
      else if (type === 'VEHICLE') v.push(entity);
    });

    return { persons: p, rooms: r, workspaces: w, vehicles: v };
  }, [entities]);

  const activeList = useMemo(() => {
    let list: WorldEntity[] = [];
    if (activeTab === 'PERSON') list = persons;
    else if (activeTab === 'ROOM') list = rooms;
    else if (activeTab === 'WORKSPACE') list = workspaces;
    else if (activeTab === 'VEHICLE') list = vehicles;

    if (!searchFilter.trim()) return list;

    const q = searchFilter.toLowerCase();
    return list.filter((e) => {
      const detail = e as DetailedTwinEntity;
      const name = (e.name || '').toLowerCase();
      const id = (e.id || '').toLowerCase();
      const role = (detail.roleTitle || '').toLowerCase();
      const dept = (detail.departmentName || '').toLowerCase();
      return name.includes(q) || id.includes(q) || role.includes(q) || dept.includes(q);
    });
  }, [activeTab, searchFilter, persons, rooms, workspaces, vehicles]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Accessible Enterprise Digital Twin Directory"
      className="absolute inset-x-0 bottom-0 z-40 max-h-[75vh] flex flex-col rounded-t-2xl border-t border-white/20 bg-slate-950/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/10"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">
              Accessible Enterprise Twin Directory
            </h2>
            <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              2D Tabular Alternative
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Authoritative enterprise operational data presented in accessible, screen-readable format.
          </p>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close accessible directory"
        >
          ✕
        </button>
      </div>

      {/* Controls & Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 bg-slate-900/60 px-6 py-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5" role="tablist">
          {([
            { id: 'PERSON' as const, label: 'Personnel', count: persons.length },
            { id: 'ROOM' as const, label: 'Facilities & Rooms', count: rooms.length },
            { id: 'WORKSPACE' as const, label: 'Workspaces', count: workspaces.length },
            { id: 'VEHICLE' as const, label: 'Fleet & Parking', count: vehicles.length },
          ]).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                activeTab === tab.id ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Filter Input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter active list..."
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Accessible Table Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th scope="col" className="pb-3 font-semibold">Entity / Name</th>
              <th scope="col" className="pb-3 font-semibold">Classification</th>
              <th scope="col" className="pb-3 font-semibold">Department / Scope</th>
              <th scope="col" className="pb-3 font-semibold">Spatial Coordinates</th>
              <th scope="col" className="pb-3 font-semibold">Authoritative Status</th>
              <th scope="col" className="pb-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {activeList.map((item) => {
              const isItemActive = selectedEntity?.id === item.id;
              const pos = item.transform?.position;
              const detail = item as DetailedTwinEntity;

              return (
                <tr
                  key={item.id}
                  className={`transition hover:bg-white/5 ${
                    isItemActive ? 'bg-sky-500/15 text-white font-medium' : ''
                  }`}
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium text-white">{item.name || item.id}</div>
                    <div className="font-mono text-[10px] text-slate-500">{item.id}</div>
                  </td>
                  <td className="py-3 pr-4">
                    {detail.roleTitle || detail.roomType || detail.vehicleClass || item.type}
                  </td>
                  <td className="py-3 pr-4 text-slate-400">
                    {detail.departmentName || item.parentId || 'HQ Campus'}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-slate-400">
                    {pos && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number'
                      ? `[${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}]`
                      : 'N/A'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center rounded border border-emerald-800/80 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      {detail.currentActivity || (detail.isOccupied ? 'OCCUPIED' : detail.isParked ? 'PARKED' : 'ACTIVE')}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => onSelectEntity(item)}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                        isItemActive
                          ? 'bg-sky-500 text-white'
                          : 'border border-white/15 hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      {isItemActive ? 'Inspecting' : 'Focus in 3D'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
