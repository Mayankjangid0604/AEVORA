'use client';

import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { WorldStateConsumer, ConnectionState, WorldEntity, V12EntityType } from '@aevora/shared';

// -- 1. RENDERER ADAPTER ----------------------------------------------------
// This bounds the React state to the agnostic WorldStateConsumer

interface AdapterProps {
  consumer: WorldStateConsumer;
}

export function V12RendererAdapter({ consumer }: AdapterProps) {
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [viewMode, setViewMode] = useState<'overhead' | 'first-person'>('overhead');

  useEffect(() => {
    // Sync initial snapshot
    const sync = () => {
      setEntities(Array.from(consumer.getEntities().values()));
    };

    consumer.onStateChange((state) => {
      if (state === ConnectionState.SYNCHRONIZED) {
        sync();
      }
    });

    consumer.onEntityUpdated(() => sync());
    consumer.onEntityRemoved(() => sync());
    
    // Fallback sync if already ready
    if (consumer.getState() === ConnectionState.STREAMING || consumer.getState() === ConnectionState.SYNCHRONIZED) {
      sync();
    }
  }, [consumer]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(0,0,0,0.7)', color: 'white', padding: 10 }}>
        <h4>V12 Technical POC</h4>
        <p>Consumer State: {consumer.getState()}</p>
        <p>Entities: {entities.length}</p>
        <button onClick={() => setViewMode(v => v === 'overhead' ? 'first-person' : 'overhead')}>
          Toggle View (Current: {viewMode})
        </button>
      </div>

      <Canvas>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        {/* Simple Terrain */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#333333" />
        </mesh>

        {/* Dynamic Entities mapped from Aevora World State */}
        {entities.map(entity => (
          <EntityMesh key={entity.id} entity={entity} />
        ))}

        {/* Camera Views */}
        {viewMode === 'overhead' ? (
          <>
            <PerspectiveCamera makeDefault position={[0, 20, 20]} />
            <OrbitControls target={[0, 0, 0]} />
          </>
        ) : (
          <>
            {/* First-person dummy camera near ground level */}
            <PerspectiveCamera makeDefault position={[0, 1.6, 5]} />
            <OrbitControls target={[0, 1.6, 0]} />
          </>
        )}
      </Canvas>
    </div>
  );
}

// -- 2. ENTITY MESH MAPPING -------------------------------------------------

function EntityMesh({ entity }: { entity: WorldEntity }) {
  const { position, scale } = entity.transform || { 
    position: { x: 0, y: 0, z: 0 }, 
    rotation: { x: 0, y: 0, z: 0, w: 1 }, 
    scale: { x: 1, y: 1, z: 1 } 
  };
  const isVisible = entity.visibility?.isVisible ?? true;
  
  if (!isVisible) return null;

  // Render different shapes based on entity type
  let color = 'white';
  let isBox = true;

  switch(entity.type) {
    case V12EntityType.BUILDING:
      color = 'blue';
      break;
    case V12EntityType.PERSON:
      color = 'green';
      isBox = false;
      break;
    case V12EntityType.ROOM:
      color = 'gray';
      break;
    case V12EntityType.VEHICLE:
      color = 'red';
      break;
  }

  return (
    <mesh 
      position={[position.x, position.y, position.z]}
      scale={[scale.x, scale.y, scale.z]}
    >
      {isBox ? <boxGeometry args={[1, 1, 1]} /> : <sphereGeometry args={[0.5, 16, 16]} />}
      <meshStandardMaterial color={color} opacity={entity.visibility?.opacity ?? 1} transparent={true} />
    </mesh>
  );
}
