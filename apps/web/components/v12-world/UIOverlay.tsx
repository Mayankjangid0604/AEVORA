import React from 'react';
import { ConnectionState, WorldEntity } from '@aevora/shared';

interface UIOverlayProps {
  connectionState: ConnectionState;
  selectedEntity: WorldEntity | null;
  viewMode: string;
  setViewMode: (mode: 'overhead' | 'first-person' | 'explore' | 'vehicle-exterior' | 'vehicle-interior') => void;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
}

export function UIOverlay({ connectionState, selectedEntity, viewMode, setViewMode, showDebug, setShowDebug }: UIOverlayProps) {
  
  const getStatusColor = (state: ConnectionState) => {
    switch(state) {
      case ConnectionState.SYNCHRONIZED: return '#4ade80';
      case ConnectionState.INITIALIZING:
      case ConnectionState.LOADING_SNAPSHOT:
      case ConnectionState.RECONCILING: return '#fbbf24';
      case ConnectionState.STREAMING: return '#60a5fa';
      case ConnectionState.DEGRADED: return '#f97316';
      case ConnectionState.ERROR: return '#ef4444';
      default: return '#9ca3af';
    }
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px', fontFamily: 'sans-serif' }}>
      
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, color: 'white', fontSize: '24px', fontWeight: '300', letterSpacing: '2px' }}>AEVORA <span style={{ fontWeight: '600' }}>SAAHVIK</span></h1>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getStatusColor(connectionState) }} />
            <span style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {connectionState}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', pointerEvents: 'auto' }}>
          {(['overhead', 'explore', 'first-person', 'vehicle-exterior', 'vehicle-interior'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                background: viewMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                color: viewMode === mode ? 'white' : '#9ca3af',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                textTransform: 'uppercase'
              }}
            >
              {mode}
            </button>
          ))}
          <button
            onClick={() => setShowDebug(!showDebug)}
            style={{
              background: showDebug ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: showDebug ? '#fbbf24' : '#9ca3af',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}
          >
            DEBUG
          </button>
        </div>
      </div>

      {/* Bottom Panel (Selection) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
        {selectedEntity && (
          <div style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '24px', borderRadius: '8px', width: '320px', pointerEvents: 'auto', backdropFilter: 'blur(10px)' }}>
            <h3 style={{ margin: '0 0 4px 0', color: 'white', fontSize: '18px', fontWeight: '500' }}>
              {selectedEntity.name || 'Unnamed Entity'}
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {selectedEntity.type.replace('_', ' ')}
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280', fontSize: '12px' }}>ID</span>
                <span style={{ color: '#d1d5db', fontSize: '12px', fontFamily: 'monospace' }}>{selectedEntity.id}</span>
              </div>
              {selectedEntity.aevoraId && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280', fontSize: '12px' }}>Aevora ID</span>
                  <span style={{ color: '#d1d5db', fontSize: '12px', fontFamily: 'monospace' }}>{selectedEntity.aevoraId}</span>
                </div>
              )}
              {selectedEntity.parentId && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280', fontSize: '12px' }}>Parent</span>
                  <span style={{ color: '#d1d5db', fontSize: '12px', fontFamily: 'monospace' }}>{selectedEntity.parentId}</span>
                </div>
              )}
              {selectedEntity.type === 'PERSON' && 'currentActivity' in selectedEntity && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280', fontSize: '12px' }}>Activity</span>
                  <span style={{ color: '#4ade80', fontSize: '12px' }}>{(selectedEntity as any).currentActivity}</span>
                </div>
              )}
              {selectedEntity.type === 'VEHICLE' && 'vehicleClass' in selectedEntity && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280', fontSize: '12px' }}>Class</span>
                  <span style={{ color: '#4ade80', fontSize: '12px' }}>{(selectedEntity as any).vehicleClass || 'STANDARD'}</span>
                </div>
              )}
              {selectedEntity.type === 'VEHICLE' && 'occupants' in selectedEntity && (selectedEntity as any).occupants?.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280', fontSize: '12px' }}>Occupants</span>
                  <span style={{ color: '#f59e0b', fontSize: '12px' }}>{(selectedEntity as any).occupants.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
