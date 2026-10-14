'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { WorldEntity, V12EntityId } from '@aevora/shared';

export interface SpatialSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  entities: Map<V12EntityId, WorldEntity>;
  onSelectEntity: (entity: WorldEntity) => void;
}

type SearchableEntity = WorldEntity & {
  roleTitle?: string;
  departmentName?: string;
  roomType?: string;
};

export function SpatialSearchModal({
  isOpen,
  onClose,
  entities,
  onSelectEntity,
}: SpatialSearchModalProps) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input and reset query whenever opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Compute filtered entities
  const searchResults = useMemo(() => {
    const list: WorldEntity[] = [];
    const q = query.trim().toLowerCase();

    entities.forEach((entity) => {
      const type = (entity.type || '').toUpperCase();
      const matchesType =
        filterType === 'ALL' ||
        (filterType === 'PERSON' && (type === 'PERSON' || type === 'EMPLOYEE')) ||
        (filterType === 'ROOM' && (type === 'ROOM' || type === 'OFFICE' || type === 'MEETING_ROOM' || type === 'DEPARTMENT_SPACE')) ||
        (filterType === 'WORKSPACE' && type === 'WORKSPACE') ||
        (filterType === 'VEHICLE' && type === 'VEHICLE') ||
        type.includes(filterType);

      if (!matchesType) {
        return;
      }

      if (!q) {
        list.push(entity);
        return;
      }

      const searchable = entity as SearchableEntity;
      const name = (entity.name || '').toLowerCase();
      const id = (entity.id || '').toLowerCase();
      const role = (searchable.roleTitle || '').toLowerCase();
      const dept = (searchable.departmentName || '').toLowerCase();
      const roomType = (searchable.roomType || '').toLowerCase();

      if (
        name.includes(q) ||
        id.includes(q) ||
        role.includes(q) ||
        dept.includes(q) ||
        roomType.includes(q)
      ) {
        list.push(entity);
      }
    });

    return list.slice(0, 40); // Cap at 40 results for clean listing
  }, [entities, query, filterType]);

  // Handle keyboard navigation inside search modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        onSelectEntity(searchResults[selectedIndex]);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 p-4 pt-20 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search campus personnel, rooms, desks, vehicles..."
            className="w-full bg-transparent text-sm font-medium text-white placeholder-slate-400 focus:outline-none"
          />
          <kbd className="rounded border border-white/20 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-slate-950/50 px-4 py-2 text-xs">
          {['ALL', 'PERSON', 'ROOM', 'WORKSPACE', 'VEHICLE'].map((type) => (
            <button
              key={type}
              onClick={() => {
                setFilterType(type);
                setSelectedIndex(0);
              }}
              className={`rounded-full px-2.5 py-0.5 font-medium transition ${
                filterType === type
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {type === 'ALL' ? 'All Entities' : type}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-500 font-mono">
            {searchResults.length} matches
          </span>
        </div>

        {/* Search Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {searchResults.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No matching spatial entities found for &quot;{query}&quot;
            </div>
          ) : (
            searchResults.map((entity, idx) => {
              const isSelected = idx === selectedIndex;
              const type = (entity.type || 'ENTITY').toUpperCase();
              const searchable = entity as SearchableEntity;

              return (
                <div
                  key={entity.id}
                  onClick={() => {
                    onSelectEntity(entity);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition ${
                    isSelected
                      ? 'bg-sky-500/20 text-white ring-1 ring-sky-400/40'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold ${
                        type === 'PERSON'
                          ? 'bg-sky-950 text-sky-400 border border-sky-800'
                          : type === 'ROOM'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : type === 'VEHICLE'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {type}
                    </span>
                    <span className="font-medium text-white truncate">
                      {entity.name || entity.id}
                    </span>
                    {searchable.roleTitle && (
                      <span className="text-slate-400 truncate">
                        • {searchable.roleTitle}
                      </span>
                    )}
                    {searchable.departmentName && (
                      <span className="text-slate-500 truncate">
                        ({searchable.departmentName})
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">
                    {entity.id.slice(0, 12)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
