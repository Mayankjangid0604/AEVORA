import React, { useMemo, useRef } from 'react';
import { WorldEntity, V12EntityType, MovementState } from '@aevora/shared';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

import { DigitalHuman } from './DigitalHuman';
import { DigitalVehicle } from './DigitalVehicle';

interface EntityMeshProps {
  entity: WorldEntity;
  isSelected: boolean;
  onSelect: (id: string) => void;
  movementState?: MovementState;
  pathNodes?: { x: number, y: number, z: number }[];
}

export function EntityMesh({ entity, isSelected, onSelect, movementState, pathNodes }: EntityMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { position, rotation, scale } = entity.transform || { 
    position: { x: 0, y: 0, z: 0 }, 
    rotation: { x: 0, y: 0, z: 0, w: 1 }, 
    scale: { x: 1, y: 1, z: 1 } 
  };
  
  const isVisible = entity.visibility?.isVisible ?? true;
  if (!isVisible) return null;

  // Convert generic quaternion to THREE.Quaternion
  const quat = useMemo(() => new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), [rotation]);
  const euler = useMemo(() => new THREE.Euler().setFromQuaternion(quat), [quat]);

  useFrame(() => {
    if (movementState?.movementState === 'MOVING' && pathNodes && pathNodes.length > 0 && groupRef.current) {
      const totalSegments = Math.max(1, pathNodes.length - 1);
      const scaledProgress = movementState.progress * totalSegments;
      const index = Math.max(0, Math.min(Math.floor(scaledProgress), pathNodes.length - 2));
      
      if (index >= 0 && index < pathNodes.length - 1) {
        const start = pathNodes[index];
        const end = pathNodes[index + 1];
        const localProgress = Math.max(0, Math.min(1, scaledProgress - index));
        
        groupRef.current.position.x = start.x + (end.x - start.x) * localProgress;
        groupRef.current.position.y = start.y + (end.y - start.y) * localProgress;
        groupRef.current.position.z = start.z + (end.z - start.z) * localProgress;

        const dir = new THREE.Vector3(end.x - start.x, 0, end.z - start.z).normalize();
        if (dir.lengthSq() > 0.001) {
           const targetRotation = Math.atan2(dir.x, dir.z);
           groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation, 0.1);
        }
      }
    }
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    onSelect(entity.id);
  };

  const renderGeometry = () => {
    switch (entity.type) {
      case V12EntityType.COMPANY:
        return (
          <group>
            {/* Visual marker for company */}
            <mesh position={[0, scale.y / 2 + 5, 0]}>
              <octahedronGeometry args={[2]} />
              <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.5} wireframe />
            </mesh>
          </group>
        );

      case V12EntityType.BUILDING:
        return (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#1f2937" opacity={0.9} transparent />
          </mesh>
        );

      case V12EntityType.FLOOR:
        return (
          <mesh position={[0, -scale.y / 2 + 0.1, 0]}>
            <boxGeometry args={[1, 0.1, 1]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
        );

      case V12EntityType.ROOM:
      case V12EntityType.OFFICE:
      case V12EntityType.DEPARTMENT_SPACE:
      case V12EntityType.MEETING_ROOM:
        return (
          <group>
            {/* Floor tile */}
            <mesh position={[0, -scale.y / 2 + 0.15, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[1, 1]} />
              <meshStandardMaterial color={entity.type === V12EntityType.MEETING_ROOM ? '#4b5563' : '#475569'} />
            </mesh>
            {/* Walls (simplified wireframe box to see inside) */}
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#64748b" wireframe opacity={0.2} transparent />
            </mesh>
          </group>
        );

      case V12EntityType.WORKSPACE:
        return (
          <mesh position={[0, -scale.y / 2 + 0.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        );

      case V12EntityType.PERSON:
        return <DigitalHuman entity={entity as any} isSelected={isSelected} />;

      case V12EntityType.VEHICLE:
        return <DigitalVehicle entity={entity as any} isSelected={isSelected} />;
        
      case V12EntityType.PARKING:
        return (
          <mesh position={[0, -scale.y / 2 + 0.1, 0]} rotation={[-Math.PI/2, 0, 0]}>
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        );

      default:
        // Generic representation for unhandled types
        return (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        );
    }
  };

  return (
    <group 
      ref={groupRef}
      position={[position.x, position.y, position.z]}
      rotation={euler}
      scale={[scale.x, scale.y, scale.z]}
      onClick={handleClick}
    >
      {renderGeometry()}
    </group>
  );
}
