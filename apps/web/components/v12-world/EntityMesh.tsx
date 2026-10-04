import React, { useMemo } from 'react';
import { WorldEntity, V12EntityType } from '@aevora/shared';
import * as THREE from 'three';

import { DigitalHuman } from './DigitalHuman';
import { DigitalVehicle } from './DigitalVehicle';

interface EntityMeshProps {
  entity: WorldEntity;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function EntityMesh({ entity, isSelected, onSelect }: EntityMeshProps) {
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
      position={[position.x, position.y, position.z]}
      rotation={euler}
      scale={[scale.x, scale.y, scale.z]}
      onClick={handleClick}
    >
      {renderGeometry()}
    </group>
  );
}
