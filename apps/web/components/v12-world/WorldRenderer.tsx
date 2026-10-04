import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sky, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { WorldEntity, TopologyEdge, NavigationNode, MovementState } from '@aevora/shared';
import { EntityMesh } from './EntityMesh';
import { NavigationOverlay } from './NavigationOverlay';

interface WorldRendererProps {
  entities: WorldEntity[];
  topology: TopologyEdge[];
  nodes: NavigationNode[];
  movementStates: Map<string, MovementState>;
  viewMode: string;
  showDebug: boolean;
  selectedEntityId: string | null;
  onSelectEntity: (id: string) => void;
}

import { DynamicCamera } from './DynamicCamera';
export function WorldRenderer({ entities, topology, nodes, movementStates, viewMode, showDebug, selectedEntityId, onSelectEntity }: WorldRendererProps) {
  
  // Find current active route for selected entity (if it's moving)
  const activeMovement = selectedEntityId ? movementStates.get(selectedEntityId) : null;
  
  // Build line points from path
  const routePoints = activeMovement?.path?.map(nodeId => {
    const node = nodes.find(n => n.id === nodeId);
    return node ? new THREE.Vector3(node.position.x, node.position.y + 0.1, node.position.z) : null;
  }).filter(Boolean) as THREE.Vector3[] || [];
  
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}>
      <Canvas shadows>
        <Suspense fallback={null}>
          <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
          <ambientLight intensity={0.4} />
          <directionalLight castShadow position={[50, 100, 50]} intensity={1.5} shadow-mapSize={[2048, 2048]} />
          
          <DynamicCamera viewMode={viewMode} entities={entities} selectedEntityId={selectedEntityId} />
          
          {/* Ground Plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={() => onSelectEntity('')}>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color="#111827" />
          </mesh>

          {/* Render Spatial Entities */}
          {entities.map(entity => {
            const movement = movementStates.get(entity.id);
            const pathNodes = movement?.path?.map(nodeId => {
              const node = nodes.find(n => n.id === nodeId);
              return node ? { x: node.position.x, y: node.position.y, z: node.position.z } : null;
            }).filter(n => n !== null) as { x: number, y: number, z: number }[] | undefined;
            return (
              <EntityMesh key={entity.id} entity={entity} isSelected={entity.id === selectedEntityId} onSelect={onSelectEntity} movementState={movement} pathNodes={pathNodes} />
            );
          })}

          {/* Render Route Visualization */}
          {routePoints.length > 1 && (
            <group>
               <line>
                 <bufferGeometry>
                   <float32BufferAttribute attach="attributes-position" args={[new Float32Array(routePoints.flatMap(p => [p.x, p.y, p.z])), 3]} />
                 </bufferGeometry>
                 <lineBasicMaterial color="#3b82f6" linewidth={3} />
               </line>
               {/* Destination Marker */}
               <mesh position={routePoints[routePoints.length - 1]}>
                 <sphereGeometry args={[0.5, 16, 16]} />
                 <meshStandardMaterial color="#ef4444" />
               </mesh>
            </group>
          )}

          {/* Render Debug / Navigation Graph */}
          {showDebug && (
            <NavigationOverlay topology={topology} nodes={nodes} />
          )}

        </Suspense>
      </Canvas>
    </div>
  );
}
