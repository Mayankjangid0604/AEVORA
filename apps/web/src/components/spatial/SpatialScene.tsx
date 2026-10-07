'use client';

import React, { useRef, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { WorldEntity, V12EntityId } from '@aevora/shared';

export interface CameraPreset {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overview', name: 'HQ Campus Overview', position: [38, 28, 48], target: [0, 4, 0] },
  { id: 'executive', name: 'Executive Level', position: [0, 24, 20], target: [0, 10, 0] },
  { id: 'main', name: 'Main Floor & Lobby', position: [0, 12, 16], target: [0, 1.5, 0] },
  { id: 'parking', name: 'Campus Parking', position: [30, 14, 30], target: [20, 0, 20] },
];

export interface SpatialSceneProps {
  entities: Map<V12EntityId, WorldEntity>;
  selectedEntity: WorldEntity | null;
  onSelectEntity: (entity: WorldEntity | null) => void;
  activePresetId?: string;
}

/**
 * Camera controller reacting to preset changes with smooth interpolation.
 */
function CameraController({ activePresetId }: { activePresetId?: string }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const targetPreset = useMemo(() => {
    return CAMERA_PRESETS.find((p) => p.id === activePresetId) ?? CAMERA_PRESETS[0]!;
  }, [activePresetId]);

  useFrame(() => {
    if (controlsRef.current) {
      // Smoothly nudge camera position and target toward active preset
      camera.position.lerp(new THREE.Vector3(...targetPreset.position), 0.05);
      controlsRef.current.target.lerp(new THREE.Vector3(...targetPreset.target), 0.05);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={120}
      maxPolarAngle={Math.PI / 2.05} // Prevent camera going below ground plane
    />
  );
}

/**
 * Campus ground plane with enterprise architectural accents.
 */
function CampusGround() {
  return (
    <group position={[0, -0.05, 0]}>
      {/* Primary landscaped plaza */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Perimeter roads & courtyard */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[26, 42, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>
      {/* Central plaza pavers */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[22, 48]} />
        <meshStandardMaterial color="#172554" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Subtle grid pattern */}
      <gridHelper args={[100, 50, '#334155', '#1e293b']} position={[0, 0.03, 0]} />
    </group>
  );
}

/**
 * Procedural stylized building shell representing Aevora Tower.
 */
function BuildingShell({
  name,
  position = [0, 8.5, 0],
  height = 17,
}: {
  name?: string;
  position?: [number, number, number];
  height?: number;
}) {
  return (
    <group position={position}>
      {/* Translucent glass tower volume */}
      <mesh>
        <boxGeometry args={[26, height, 26]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transmission={0.85}
          opacity={0.3}
          transparent
          roughness={0.1}
          metalness={0.1}
          ior={1.5}
        />
      </mesh>
      {/* Structural corner columns */}
      {[-12.8, 12.8].map((x) =>
        [-12.8, 12.8].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0, z]}>
            <boxGeometry args={[0.8, height, 0.8]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>
        ))
      )}
      {/* Roof crown / penthouse beacon */}
      <mesh position={[0, height / 2 + 0.3, 0]}>
        <boxGeometry args={[22, 0.6, 22]} />
        <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, height / 2 + 0.9, 0]}>
        <boxGeometry args={[8, 0.6, 8]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Floor slab renderer.
 */
function FloorSlab({
  name,
  level,
  position,
  isSelected,
  onClick,
}: {
  name: string;
  level: number;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const isExec = level >= 100 || name.toLowerCase().includes('exec');
  const slabY = position[1];

  return (
    <group position={[position[0], slabY, position[2]]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Main floor slab */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[24, 0.4, 24]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : isExec ? '#1e1b4b' : '#1e293b'}
          roughness={0.4}
          metalness={isExec ? 0.4 : 0.2}
        />
      </mesh>
      {/* Floor edge accent light strip */}
      <mesh position={[0, 0.22, 12.05]}>
        <boxGeometry args={[24, 0.05, 0.05]} />
        <meshBasicMaterial color={isExec ? '#a855f7' : '#0284c7'} />
      </mesh>
      {/* Floor sign / level tag */}
      <Text
        position={[-11.5, 0.8, 12.1]}
        fontSize={0.45}
        color={isExec ? '#c084fc' : '#93c5fd'}
        anchorX="left"
        anchorY="middle"
      >
        {name.toUpperCase()} {isExec ? '• L100' : '• L1'}
      </Text>
    </group>
  );
}

/**
 * Room and office procedural box representation with doorways and interior styling.
 */
function RoomNode({
  entity,
  isSelected,
  onClick,
}: {
  entity: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const t = entity.transform?.position || { x: 0, y: 0, z: 0 };
  const rType = entity.roomType || entity.type || 'ROOM';
  const name = entity.name || 'Room';

  // Room geometry and styling mapping
  const styling = useMemo(() => {
    switch (rType) {
      case 'CHAIRMAN_OFFICE':
        return {
          width: 8,
          depth: 7,
          height: 3,
          wallColor: '#fbbf24',
          accentColor: '#f59e0b',
          floorColor: '#451a03',
          label: 'CHAIRMAN OFFICE',
          badge: '👑 Executive Suite',
        };
      case 'CEO_OFFICE':
      case 'MD_OFFICE':
      case 'HEAD_OFFICE':
        return {
          width: 8,
          depth: 7,
          height: 3,
          wallColor: '#818cf8',
          accentColor: '#6366f1',
          floorColor: '#1e1b4b',
          label: name.toUpperCase(),
          badge: '⚡ Executive Office',
        };
      case 'CONFERENCE_ROOM':
      case 'MEETING_ROOM':
        return {
          width: 7,
          depth: 6,
          height: 3,
          wallColor: '#34d399',
          accentColor: '#10b981',
          floorColor: '#064e3b',
          label: name.toUpperCase(),
          badge: '📊 Conference & Review',
        };
      case 'LOBBY':
      case 'RECEPTION':
        return {
          width: 10,
          depth: 8,
          height: 3,
          wallColor: '#38bdf8',
          accentColor: '#0284c7',
          floorColor: '#0f172a',
          label: name.toUpperCase(),
          badge: '🏛️ Main Reception',
        };
      case 'CORRIDOR':
        return {
          width: 14,
          depth: 2.5,
          height: 2.8,
          wallColor: '#64748b',
          accentColor: '#475569',
          floorColor: '#1e293b',
          label: name.toUpperCase(),
          badge: '🚶 Corridor',
        };
      case 'DEPARTMENT_SPACE':
      default:
        return {
          width: 6.5,
          depth: 5.5,
          height: 3,
          wallColor: '#94a3b8',
          accentColor: '#3b82f6',
          floorColor: '#1e293b',
          label: name.toUpperCase(),
          badge: '🏢 Department Area',
        };
    }
  }, [rType, name]);

  // Adjust Y coordinate: use transform.position.y if present, otherwise default by type
  const isExec = entity.parentId?.includes('exec') || rType.includes('CHAIRMAN') || rType.includes('CEO') || rType.includes('HEAD') || rType.includes('CONFERENCE');
  const posY = t.y ? t.y + 1.5 : (isExec ? 12.5 : 1.6);
  const posX = t.x !== undefined ? t.x : (rType.includes('CEO') ? 5 : rType.includes('CHAIRMAN') ? -5 : 0);
  const posZ = t.z !== undefined ? t.z : (rType.includes('CORRIDOR') ? 0 : rType.includes('OFFICE') ? -4 : 4);

  return (
    <group
      position={[posX, posY, posZ]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Room boundary walls (semi-translucent for visibility) */}
      <mesh position={[0, styling.height / 2, 0]}>
        <boxGeometry args={[styling.width, styling.height, styling.depth]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : hovered ? styling.accentColor : styling.wallColor}
          transparent
          opacity={hovered || isSelected ? 0.45 : 0.25}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>

      {/* Room floor inset */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[styling.width - 0.2, styling.depth - 0.2]} />
        <meshStandardMaterial color={styling.floorColor} roughness={0.6} />
      </mesh>

      {/* Ceiling edge accent lights */}
      <mesh position={[0, styling.height, 0]}>
        <boxGeometry args={[styling.width, 0.1, styling.depth]} />
        <meshBasicMaterial color={isSelected ? '#38bdf8' : styling.accentColor} wireframe />
      </mesh>

      {/* Office furniture placeholders */}
      {rType.includes('OFFICE') && (
        <group position={[0, 0.4, -styling.depth / 4]}>
          {/* Executive desk */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[2.4, 0.8, 1.2]} />
            <meshStandardMaterial color="#78350f" roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Executive chair */}
          <mesh position={[0, 0.4, -0.9]}>
            <boxGeometry args={[0.7, 1.1, 0.7]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} />
          </mesh>
          {/* Holographic desktop display */}
          <mesh position={[0, 0.65, 0]}>
            <boxGeometry args={[1.2, 0.5, 0.05]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        </group>
      )}

      {/* Conference table for meeting spaces */}
      {(rType === 'CONFERENCE_ROOM' || rType === 'MEETING_ROOM') && (
        <group position={[0, 0.4, 0]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[3.2, 0.75, 1.6]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[1.6, 0.02, 0.8]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>
        </group>
      )}

      {/* Floating 3D Room Label */}
      <Text
        position={[0, styling.height + 0.35, 0]}
        fontSize={0.32}
        color={isSelected ? '#38bdf8' : '#f8fafc'}
        anchorX="center"
        anchorY="bottom"
      >
        {styling.label}
      </Text>

      {/* Selected / Hovered tooltip overlay */}
      {(hovered || isSelected) && (
        <Html position={[0, styling.height + 0.8, 0]} center distanceFactor={15}>
          <div className="pointer-events-none whitespace-nowrap rounded bg-slate-900/90 px-2 py-1 text-xs font-medium text-slate-100 shadow-lg ring-1 ring-white/20 backdrop-blur">
            <span className="mr-1">{styling.badge}</span>
            <span className="font-semibold text-sky-400">{name}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Workspace node representing individual desks / workstations.
 */
function WorkspaceNode({
  entity,
  isSelected,
  onClick,
}: {
  entity: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isOccupied = entity.isOccupied ?? false;
  const isExec = entity.name?.toLowerCase().includes('chairman') || entity.name?.toLowerCase().includes('ceo');
  const pos = entity.transform?.position || { x: 0, y: 0, z: 0 };
  const y = isExec ? 12.5 : 1.6;

  return (
    <group
      position={[pos.x || 0, y, pos.z || 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Desk surface */}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[1.4, 0.05, 0.8]} />
        <meshStandardMaterial color={isSelected ? '#38bdf8' : '#334155'} roughness={0.4} />
      </mesh>
      {/* Monitor */}
      <mesh position={[0, 0.6, -0.2]}>
        <boxGeometry args={[0.6, 0.35, 0.04]} />
        <meshBasicMaterial color={isOccupied ? '#38bdf8' : '#64748b'} />
      </mesh>
      {/* Chair */}
      <mesh position={[0, 0.3, 0.4]}>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Status indicator LED */}
      <mesh position={[0.6, 0.42, -0.3]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={isOccupied ? '#22c55e' : '#eab308'} />
      </mesh>
    </group>
  );
}

/**
 * Stylized procedural human placeholder representing an employee / avatar.
 */
function PersonNode({
  entity,
  isSelected,
  onClick,
}: {
  entity: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = entity.transform?.position || { x: 0, y: 0, z: 0 };
  const name = entity.name || 'Employee';
  const isChairman = name.toLowerCase().includes('chairman') || (entity.roleTitle || '').toLowerCase().includes('chairman');
  const isCeo = name.toLowerCase().includes('ceo') || (entity.roleTitle || '').toLowerCase().includes('ceo');

  // Ground elevation: if exact 3D desk Y is provided, use it; otherwise fallback to floor heights
  const y = pos.y && pos.y > 0 ? pos.y : (isChairman || isCeo ? 16.4 : 1.4);

  // Department / Role aesthetic palette
  const deptName = (entity.departmentName || '').toLowerCase();
  const roleTitle = (entity.roleTitle || '').toLowerCase();
  let color = '#38bdf8'; // sky default
  if (isChairman) color = '#f59e0b'; // amber
  else if (isCeo) color = '#818cf8'; // indigo
  else if (deptName.includes('engineer') || roleTitle.includes('engineer') || roleTitle.includes('dev')) color = '#06b6d4'; // cyan
  else if (deptName.includes('product')) color = '#8b5cf6'; // purple
  else if (deptName.includes('design')) color = '#ec4899'; // pink
  else if (deptName.includes('marketing') || deptName.includes('growth')) color = '#f97316'; // orange
  else if (deptName.includes('operation')) color = '#10b981'; // emerald

  const currentActivity = entity.currentActivity || 'WORKING';
  const activityColor = currentActivity === 'WORKING' ? '#10b981' : currentActivity === 'IN_MEETING' ? '#f59e0b' : '#64748b';

  return (
    <group
      position={[pos.x || 0, y, pos.z || 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Head */}
      <mesh position={[0, 1.4, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.8, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
      {/* Department accent band */}
      <mesh position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.185, 0.195, 0.2, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Base activity halo ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial color={isSelected ? '#38bdf8' : activityColor} />
      </mesh>

      {/* Floating name badge */}
      <Text
        position={[0, 1.85, 0]}
        fontSize={0.25}
        color={isSelected ? '#38bdf8' : '#ffffff'}
        anchorX="center"
        anchorY="bottom"
      >
        {name}
      </Text>

      {(hovered || isSelected) && (
        <Html position={[0, 2.2, 0]} center distanceFactor={15}>
          <div className="pointer-events-none whitespace-nowrap rounded bg-slate-900/95 px-2.5 py-1 text-xs text-slate-100 shadow-xl ring-1 ring-sky-400/50">
            <div className="font-semibold text-sky-300">{name}</div>
            <div className="text-[10px] text-slate-400">
              {entity.roleTitle || (isChairman ? 'Executive Chairman' : isCeo ? 'Chief Executive' : 'Staff')}
              {entity.departmentName ? ` • ${entity.departmentName}` : ''}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Campus parking area and procedural vehicles.
 */
function ParkingArea({
  entity,
  isSelected,
  onClick,
}: {
  entity: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = entity.transform?.position || { x: 28, y: 0, z: 28 };

  return (
    <group
      position={[pos.x, 0.02, pos.z]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Paved parking asphalt */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      {/* Parking boundary curb */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[18.2, 0.15, 14.2]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* Parking bay stripes */}
      {[-6, -2, 2, 6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.03, 0]}>
          <planeGeometry args={[0.1, 10]} />
          <meshBasicMaterial color="#94a3b8" />
        </mesh>
      ))}
      <Text position={[0, 0.2, 7.5]} fontSize={0.4} color="#94a3b8" anchorX="center">
        {entity.name || 'HQ PARKING & EXECUTIVE FLEET'}
      </Text>
    </group>
  );
}

/**
 * Procedural enterprise fleet vehicle node projecting authoritative V12SpatialVehicle.
 */
function VehicleNode({
  entity,
  isSelected,
  onClick,
}: {
  entity: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = entity.transform?.position || { x: 0, y: 0.35, z: 0 };
  const vClass = (entity.vehicleClass || 'STANDARD').toUpperCase();

  // Class-specific styling & dimensions
  const style = useMemo(() => {
    switch (vClass) {
      case 'CHAIRMAN':
        return {
          bodyColor: '#18181b', // Obsidian black
          trimColor: '#f59e0b', // Gold trim
          glassColor: '#451a03',
          metalness: 0.85,
          roughness: 0.15,
          length: 4.8,
          width: 2.3,
          height: 0.75,
          label: 'Executive Chairman Limousine',
          tag: '👑 Chairman Fleet',
        };
      case 'CEO':
        return {
          bodyColor: '#09090b', // Deep carbon
          trimColor: '#6366f1', // Indigo executive trim
          glassColor: '#1e1b4b',
          metalness: 0.8,
          roughness: 0.2,
          length: 4.5,
          width: 2.2,
          height: 0.7,
          label: 'Chief Executive Flagship',
          tag: '⚡ CEO Fleet',
        };
      case 'MD':
        return {
          bodyColor: '#064e3b', // Deep emerald
          trimColor: '#10b981',
          glassColor: '#022c22',
          metalness: 0.75,
          roughness: 0.25,
          length: 4.3,
          width: 2.2,
          height: 0.7,
          label: 'Managing Director Saloon',
          tag: '🛡️ MD Fleet',
        };
      case 'EXECUTIVE':
        return {
          bodyColor: '#1e1b4b', // Executive navy
          trimColor: '#818cf8',
          glassColor: '#0f172a',
          metalness: 0.75,
          roughness: 0.25,
          length: 4.2,
          width: 2.1,
          height: 0.68,
          label: 'Executive Saloon',
          tag: '💼 Executive',
        };
      case 'ASSISTANT':
      case 'STANDARD':
      default:
        return {
          bodyColor: '#0284c7', // Enterprise sky blue
          trimColor: '#38bdf8',
          glassColor: '#0f172a',
          metalness: 0.7,
          roughness: 0.3,
          length: 3.9,
          width: 2.0,
          height: 0.65,
          label: 'Enterprise Fleet Vehicle',
          tag: '🚗 Pool Vehicle',
        };
    }
  }, [vClass]);

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Selection halo */}
      {isSelected && (
        <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[style.width * 0.7, style.width * 0.9, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Main chassis */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[style.width, style.height, style.length]} />
        <meshStandardMaterial
          color={hovered ? '#38bdf8' : style.bodyColor}
          metalness={style.metalness}
          roughness={style.roughness}
        />
      </mesh>

      {/* Cabin glass */}
      <mesh position={[0, 0.8, -0.2]} castShadow>
        <boxGeometry args={[style.width * 0.82, style.height * 0.75, style.length * 0.55]} />
        <meshPhysicalMaterial
          color={style.glassColor}
          transmission={0.65}
          transparent
          roughness={0.1}
          metalness={0.2}
        />
      </mesh>

      {/* Chrome / Accent Trim Line */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[style.width + 0.04, 0.06, style.length + 0.04]} />
        <meshStandardMaterial color={style.trimColor} metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Headlights (Front is +Z) */}
      <mesh position={[-style.width * 0.38, 0.32, style.length * 0.5]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[style.width * 0.38, 0.32, style.length * 0.5]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>

      {/* Taillights (Rear is -Z) */}
      <mesh position={[-style.width * 0.38, 0.35, -style.length * 0.5]}>
        <boxGeometry args={[0.3, 0.12, 0.04]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[style.width * 0.38, 0.35, -style.length * 0.5]}>
        <boxGeometry args={[0.3, 0.12, 0.04]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>

      {/* Procedural Wheels */}
      {([
        [-style.width * 0.48, -style.length * 0.3],
        [style.width * 0.48, -style.length * 0.3],
        [-style.width * 0.48, style.length * 0.3],
        [style.width * 0.48, style.length * 0.3],
      ] as [number, number][]).map(([wx, wz], idx) => (
        <group key={idx} position={[wx, 0.05, wz]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3, 0.3, 0.18, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.16, 0.19, 8]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Hover Info Tooltip */}
      {(hovered || isSelected) && (
        <Html position={[0, 1.8, 0]} center distanceFactor={15}>
          <div className="pointer-events-none whitespace-nowrap rounded bg-slate-900/95 px-2.5 py-1 text-xs text-slate-100 shadow-xl ring-1 ring-sky-400/50">
            <div className="flex items-center gap-1.5 font-semibold text-sky-300">
              <span>{style.tag}</span>
              <span>•</span>
              <span>{entity.id.replace('v12_vehicle_', '').slice(0, 8)}</span>
            </div>
            <div className="text-[10px] text-slate-400">
              {style.label} {entity.isParked ? '• Parked' : '• In Transit'}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Main 3D Spatial Scene rendering all authoritative entities.
 */
export function SpatialScene({
  entities,
  selectedEntity,
  onSelectEntity,
  activePresetId,
}: SpatialSceneProps) {
  // Categorize authoritative entities by type
  const { campuses, buildings, floors, rooms, workspaces, persons, parkings, vehicles } = useMemo(() => {
    const c: any[] = [];
    const b: any[] = [];
    const f: any[] = [];
    const r: any[] = [];
    const w: any[] = [];
    const p: any[] = [];
    const pk: any[] = [];
    const vh: any[] = [];

    entities.forEach((entity) => {
      const type = entity.type?.toUpperCase();
      if (type === 'CAMPUS' || type === 'SITE') c.push(entity);
      else if (type === 'BUILDING') b.push(entity);
      else if (type === 'FLOOR') f.push(entity);
      else if (type === 'ROOM' || type === 'OFFICE' || type === 'DEPARTMENT_SPACE' || type === 'MEETING_ROOM') r.push(entity);
      else if (type === 'WORKSPACE') w.push(entity);
      else if (type === 'PERSON' || type === 'EMPLOYEE') p.push(entity);
      else if (type === 'PARKING' || type === 'PARKING_AREA') pk.push(entity);
      else if (type === 'VEHICLE') vh.push(entity);
      else r.push(entity); // fallback to room representation
    });

    return {
      campuses: c,
      buildings: b,
      floors: f,
      rooms: r,
      workspaces: w,
      persons: p,
      parkings: pk,
      vehicles: vh,
    };
  }, [entities]);

  return (
    <>
      <CameraController activePresetId={activePresetId} />

      {/* Lighting setup */}
      <ambientLight intensity={0.7} color="#cbd5e1" />
      <directionalLight
        position={[40, 60, 30]}
        intensity={1.2}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-30, 20, -20]} intensity={0.4} color="#60a5fa" />
      <hemisphereLight args={['#38bdf8', '#0f172a', 0.5]} />

      {/* Campus Ground & Environment */}
      <CampusGround />

      {/* Primary & Expansion Building Architecture */}
      {buildings.length > 0 ? (
        buildings.map((b, idx) => {
          const bFloors = floors.filter((f) => f.parentId === b.id || f.parentId?.includes(b.id));
          const maxLevel = Math.max(1, ...bFloors.map((f) => (f.level < 100 ? f.level : 1)));
          const hasExec = bFloors.some((f) => f.level >= 100);
          const height = Math.max(16, (maxLevel + (hasExec ? 1 : 0)) * 4.2 + 2);
          const posX = b.transform?.position?.x ?? (idx === 0 ? 0 : 36 * idx);
          const posZ = b.transform?.position?.z ?? 0;
          return (
            <BuildingShell
              key={b.id}
              name={b.name}
              position={[posX, height / 2, posZ]}
              height={height}
            />
          );
        })
      ) : (
        <BuildingShell name="Aevora Tower" position={[0, 8.5, 0]} height={17} />
      )}

      {/* Authoritative Floors */}
      {floors.map((floor) => {
        const isExec = (floor.level ?? 0) >= 100 || floor.name?.includes('Executive');
        const posY = floor.transform?.position?.y !== undefined
          ? floor.transform.position.y
          : isExec ? 16 : ((floor.level ?? 1) - 1) * 4;
        const posX = floor.transform?.position?.x ?? 0;
        const posZ = floor.transform?.position?.z ?? 0;
        return (
          <FloorSlab
            key={floor.id}
            name={floor.name || `Floor ${floor.level}`}
            level={floor.level ?? (isExec ? 100 : 1)}
            position={[posX, posY + 0.2, posZ]}
            isSelected={selectedEntity?.id === floor.id}
            onClick={() => onSelectEntity(floor)}
          />
        );
      })}

      {/* If no floors in snapshot yet, render authoritative baseline floors */}
      {floors.length === 0 && (
        <>
          <FloorSlab
            name="Main Floor"
            level={1}
            position={[0, 0.2, 0]}
            isSelected={false}
            onClick={() => {}}
          />
          <FloorSlab
            name="Executive Level"
            level={100}
            position={[0, 11.8, 0]}
            isSelected={false}
            onClick={() => {}}
          />
        </>
      )}

      {/* Authoritative Rooms & Offices */}
      {rooms.map((room) => (
        <RoomNode
          key={room.id}
          entity={room}
          isSelected={selectedEntity?.id === room.id}
          onClick={() => onSelectEntity(room)}
        />
      ))}

      {/* Authoritative Workspaces */}
      {workspaces.map((ws) => (
        <WorkspaceNode
          key={ws.id}
          entity={ws}
          isSelected={selectedEntity?.id === ws.id}
          onClick={() => onSelectEntity(ws)}
        />
      ))}

      {/* Authoritative Persons / Avatars */}
      {persons.map((person) => (
        <PersonNode
          key={person.id}
          entity={person}
          isSelected={selectedEntity?.id === person.id}
          onClick={() => onSelectEntity(person)}
        />
      ))}

      {/* Parking Area & Fleet */}
      {parkings.length > 0 ? (
        parkings.map((pk) => (
          <ParkingArea
            key={pk.id}
            entity={pk}
            isSelected={selectedEntity?.id === pk.id}
            onClick={() => onSelectEntity(pk)}
          />
        ))
      ) : (
        <ParkingArea
          entity={{ id: 'parking-default', name: 'HQ Parking', transform: { position: { x: 26, y: 0, z: 26 } } }}
          isSelected={selectedEntity?.id === 'parking-default'}
          onClick={() => onSelectEntity({ id: 'parking-default', type: 'PARKING', name: 'HQ Parking' } as any)}
        />
      )}

      {/* Authoritative Fleet Vehicles */}
      {vehicles.map((vehicle) => (
        <VehicleNode
          key={vehicle.id}
          entity={vehicle}
          isSelected={selectedEntity?.id === vehicle.id}
          onClick={() => onSelectEntity(vehicle)}
        />
      ))}
    </>
  );
}
