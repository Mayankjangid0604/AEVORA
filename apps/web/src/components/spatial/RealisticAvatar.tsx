'use client';

import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import {
  deriveEmployeeSpatialState,
  deriveEmbodimentExpression,
  PostureState,
  type WorldEntity,
  type EmployeeSpatialStateInputs,
} from '@aevora/shared';
import { useAdaptivePerformance } from './AdaptivePerformanceController';

export type AvatarEntity = WorldEntity & {
  roleTitle?: string;
  departmentName?: string;
  movement?: { movementState?: EmployeeSpatialStateInputs['movementState']; movementMode?: string };
  currentActivity?: string;
  status?: string;
  isSpeaking?: boolean;
  isListening?: boolean;
};

export interface RealisticAvatarProps {
  entity: AvatarEntity;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Deterministic pseudo-random phase offset generator from string ID.
 * Ensures employees don't breathe or sway in creepy unison.
 */
function hashPhase(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 100;
}

/**
 * V22 Realistic Digital Employee Avatar Component
 * Proportional procedural human embodiment with business attire, department color accents,
 * articulated walking/idle/seated kinematics, and strict separation between factual
 * enterprise activity and illustrative ambient motion.
 */
export function RealisticAvatar({
  entity,
  isSelected,
  onClick,
}: RealisticAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const { settings } = useAdaptivePerformance();

  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);

  const phaseOffset = useMemo(() => hashPhase(entity.id || 'default'), [entity.id]);

  const pos = entity.transform?.position || { x: 0, y: 0, z: 0 };
  const name = entity.name || 'Enterprise Personnel';
  const roleTitle = entity.roleTitle || 'Personnel';
  const departmentName = entity.departmentName || 'Enterprise Operations';
  const employeeId = entity.aevoraId || entity.id.replace('v12_person_', '');

  const isChairman = name.toLowerCase().includes('chairman') || roleTitle.toLowerCase().includes('chairman');
  const isCeo = name.toLowerCase().includes('ceo') || roleTitle.toLowerCase().includes('ceo');

  // Derive authoritative spatial state and expression
  const spatialState = useMemo(() => {
    return deriveEmployeeSpatialState({
      movementState: entity.movement?.movementState,
      movementMode: entity.movement?.movementMode || 'WALK',
      currentActivity: entity.currentActivity || 'WORKING',
      employeeStatus: entity.status || 'ACTIVE',
    });
  }, [entity.movement?.movementState, entity.movement?.movementMode, entity.currentActivity, entity.status]);

  const expression = useMemo(() => {
    return deriveEmbodimentExpression({
      spatialState,
      isSpeaking: entity.isSpeaking ?? false,
      isListening: entity.isListening ?? false,
      isExecutive: isChairman || isCeo,
    });
  }, [spatialState, entity.isSpeaking, entity.isListening, isChairman, isCeo]);

  // Department-specific tailoring palette
  const styling = useMemo(() => {
    const dept = departmentName.toLowerCase();
    const role = roleTitle.toLowerCase();

    let accent = '#38bdf8'; // Default Sky
    let suit = '#1e293b'; // Charcoal Navy
    let shirt = '#f8fafc'; // Crisp White
    let badgeBorder = 'border-sky-500/40';

    if (isChairman) {
      accent = '#f59e0b'; // Amber Gold
      suit = '#09090b'; // Deep Obsidian
      shirt = '#fef3c7'; // Champagne
      badgeBorder = 'border-amber-500/60';
    } else if (isCeo) {
      accent = '#818cf8'; // Indigo
      suit = '#0f172a'; // Midnight
      shirt = '#e0e7ff';
      badgeBorder = 'border-indigo-500/60';
    } else if (dept.includes('engineer') || role.includes('engineer') || role.includes('dev')) {
      accent = '#06b6d4'; // Cyan
      suit = '#1e293b';
      shirt = '#e0f2fe';
      badgeBorder = 'border-cyan-500/40';
    } else if (dept.includes('product')) {
      accent = '#8b5cf6'; // Purple
      suit = '#1e293b';
      shirt = '#f3e8ff';
      badgeBorder = 'border-purple-500/40';
    } else if (dept.includes('operation')) {
      accent = '#10b981'; // Emerald
      suit = '#0f172a';
      shirt = '#ecfdf5';
      badgeBorder = 'border-emerald-500/40';
    } else if (dept.includes('growth') || dept.includes('marketing')) {
      accent = '#f97316'; // Orange
      suit = '#1e293b';
      shirt = '#fff7ed';
      badgeBorder = 'border-orange-500/40';
    }

    return { accent, suit, shirt, badgeBorder };
  }, [departmentName, roleTitle, isChairman, isCeo]);

  // World height positioning
  const groundY = pos.y && pos.y > 0 ? pos.y : (isChairman || isCeo ? 16.4 : 1.4);

  // Kinematic animation update loop
  useFrame(({ clock }) => {
    if (!settings.avatarArticulation) {
      if (leftLegRef.current && leftLegRef.current.rotation.x !== 0) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current && rightLegRef.current.rotation.x !== 0) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current && leftArmRef.current.rotation.x !== 0) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current && rightArmRef.current.rotation.x !== 0) rightArmRef.current.rotation.x = 0;
      if (groupRef.current && groupRef.current.position.y !== groundY) groupRef.current.position.y = groundY;
      return;
    }

    const t = clock.getElapsedTime() + phaseOffset;

    // 1. Walking Kinematics (MOVING / TRAVELLING)
    if (expression.posture === PostureState.WALKING) {
      const walkSpeed = 6.0;
      const legAngle = Math.sin(t * walkSpeed) * 0.45;
      const armAngle = -Math.sin(t * walkSpeed) * 0.35;
      const bounce = Math.abs(Math.sin(t * walkSpeed * 2)) * 0.04;

      if (leftLegRef.current) leftLegRef.current.rotation.x = legAngle;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legAngle;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armAngle;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -armAngle;
      if (groupRef.current) groupRef.current.position.y = groundY + bounce;
    }
    // 2. Seated Posture (WORKING / IN_MEETING)
    else if (expression.posture === PostureState.SEATED) {
      if (leftLegRef.current) leftLegRef.current.rotation.x = -Math.PI / 2.2;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.PI / 2.2;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 3;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 3;
      if (groupRef.current) groupRef.current.position.y = groundY - 0.42; // Seat offset
    }
    // 3. Driving Posture (IN_VEHICLE)
    else if (expression.posture === PostureState.DRIVING) {
      if (leftLegRef.current) leftLegRef.current.rotation.x = -Math.PI / 2.4;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.PI / 2.4;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 2.5;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 2.5;
      if (groupRef.current) groupRef.current.position.y = groundY - 0.35;
    }
    // 4. Standing Idle Breathing & Natural Sway
    else {
      const breath = 1 + Math.sin(t * 1.8) * 0.025;
      const sway = Math.sin(t * 0.8) * 0.015;

      if (chestRef.current) {
        chestRef.current.scale.set(breath, breath, breath);
      }
      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 0.5) * 0.08;
      }
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = sway;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -sway;
      if (groupRef.current) groupRef.current.position.y = groundY;
    }
  });

  // Authoritative activity badge color
  const activity = entity.currentActivity || 'WORKING';
  const activityTagColor =
    activity === 'WORKING'
      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/60'
      : activity === 'IN_MEETING'
      ? 'bg-amber-950/90 text-amber-300 border-amber-700/60'
      : activity === 'TRAVELLING'
      ? 'bg-sky-950/90 text-sky-300 border-sky-700/60'
      : 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <group
      ref={groupRef}
      position={[pos.x || 0, groundY, pos.z || 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Selection / Focus Halo */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.54, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} />
        </mesh>
      )}

      {/* Base Operational Halo Ring */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.38, 32]} />
        <meshBasicMaterial
          color={
            isSelected
              ? '#38bdf8'
              : activity === 'WORKING'
              ? '#10b981'
              : activity === 'IN_MEETING'
              ? '#f59e0b'
              : '#64748b'
          }
        />
      </mesh>

      {/* --- Procedural Anatomical Human Embodiment (~1.75m scale) --- */}

      {/* 1. Pelvis / Hips Base */}
      <mesh position={[0, 0.95, 0]} castShadow={settings.shadows}>
        <boxGeometry args={[0.34, 0.16, 0.22]} />
        <meshStandardMaterial color={styling.suit} roughness={0.6} />
      </mesh>

      {/* 2. Left Leg (Articulated at Hip 0.9m) */}
      <group ref={leftLegRef} position={[-0.1, 0.9, 0]}>
        {/* Thigh & Calves */}
        <mesh position={[0, -0.42, 0]} castShadow={settings.shadows}>
          <boxGeometry args={[0.13, 0.82, 0.16]} />
          <meshStandardMaterial color={styling.suit} roughness={0.6} />
        </mesh>
        {/* Dress Shoe */}
        <mesh position={[0, -0.85, 0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#09090b" roughness={0.3} metalness={0.4} />
        </mesh>
      </group>

      {/* 3. Right Leg (Articulated at Hip 0.9m) */}
      <group ref={rightLegRef} position={[0.1, 0.9, 0]}>
        {/* Thigh & Calves */}
        <mesh position={[0, -0.42, 0]} castShadow={settings.shadows}>
          <boxGeometry args={[0.13, 0.82, 0.16]} />
          <meshStandardMaterial color={styling.suit} roughness={0.6} />
        </mesh>
        {/* Dress Shoe */}
        <mesh position={[0, -0.85, 0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#09090b" roughness={0.3} metalness={0.4} />
        </mesh>
      </group>

      {/* 4. Torso / Tailored Jacket & Shirt */}
      <mesh ref={chestRef} position={[0, 1.25, 0]} castShadow={settings.shadows}>
        <boxGeometry args={[0.38, 0.48, 0.24]} />
        <meshStandardMaterial color={styling.suit} roughness={0.5} />
      </mesh>

      {/* Shirt Collar / V-Neck Opening */}
      <mesh position={[0, 1.38, 0.125]}>
        <planeGeometry args={[0.14, 0.18]} />
        <meshBasicMaterial color={styling.shirt} />
      </mesh>

      {/* Corporate Tie / Department Accent Stripe */}
      <mesh position={[0, 1.26, 0.13]}>
        <planeGeometry args={[0.04, 0.22]} />
        <meshBasicMaterial color={styling.accent} />
      </mesh>

      {/* Digital NFC Corporate Badge / Lanyard */}
      <group position={[0.08, 1.2, 0.135]}>
        <mesh>
          <planeGeometry args={[0.06, 0.09]} />
          <meshStandardMaterial color="#0284c7" emissive={styling.accent} emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* 5. Left Arm (Shoulder Pivot at 1.42m) */}
      <group ref={leftArmRef} position={[-0.24, 1.42, 0]}>
        {/* Arm Sleeve */}
        <mesh position={[0, -0.28, 0]} castShadow={settings.shadows}>
          <boxGeometry args={[0.1, 0.54, 0.12]} />
          <meshStandardMaterial color={styling.suit} roughness={0.5} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.58, 0]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color="#fbcfe8" roughness={0.7} />
        </mesh>
      </group>

      {/* 6. Right Arm (Shoulder Pivot at 1.42m) */}
      <group ref={rightArmRef} position={[0.24, 1.42, 0]}>
        {/* Arm Sleeve */}
        <mesh position={[0, -0.28, 0]} castShadow={settings.shadows}>
          <boxGeometry args={[0.1, 0.54, 0.12]} />
          <meshStandardMaterial color={styling.suit} roughness={0.5} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.58, 0]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color="#fbcfe8" roughness={0.7} />
        </mesh>
      </group>

      {/* 7. Head & Neck */}
      <group ref={headRef} position={[0, 1.55, 0]}>
        {/* Neck */}
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.1, 12]} />
          <meshStandardMaterial color="#fbcfe8" roughness={0.6} />
        </mesh>
        {/* Head Cranium */}
        <mesh position={[0, 0.12, 0]} castShadow={settings.shadows}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshStandardMaterial color="#fbcfe8" roughness={0.6} />
        </mesh>
        {/* Hair Cap */}
        <mesh position={[0, 0.17, -0.02]}>
          <sphereGeometry args={[0.135, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.8} />
        </mesh>
      </group>

      {/* Floating 3D Name Tag */}
      <Text
        position={[0, 1.95, 0]}
        fontSize={0.24}
        color={isSelected ? '#38bdf8' : '#ffffff'}
        anchorX="center"
        anchorY="bottom"
      >
        {name}
      </Text>

      {/* Interactive Tooltip & Context Details on Hover/Selection */}
      {(hovered || isSelected) && (
        <Html position={[0, 2.3, 0]} center distanceFactor={14}>
          <div className="pointer-events-none min-w-[200px] rounded-lg bg-slate-950/95 p-3 text-xs shadow-2xl ring-1 ring-white/20 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
              <span className="font-semibold text-white truncate max-w-[140px]">{name}</span>
              <span className="font-mono text-[10px] text-slate-400">#{employeeId.slice(0, 6)}</span>
            </div>

            <div className="mt-2 space-y-1 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Role:</span>
                <span className="font-medium text-sky-300 truncate max-w-[120px]">{roleTitle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Department:</span>
                <span className="font-medium text-slate-300 truncate max-w-[120px]">{departmentName}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500">Authoritative State:</span>
                <span className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold ${activityTagColor}`}>
                  {spatialState}
                </span>
              </div>
            </div>

            <div className="mt-2 border-t border-slate-800 pt-1 text-[9px] text-slate-500 font-mono">
              Factual Twin • Procedural Embodiment
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
