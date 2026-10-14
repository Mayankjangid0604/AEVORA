'use client';

import React, { useMemo } from 'react';
import { useAdaptivePerformance } from './AdaptivePerformanceController';

export interface CinematicEnvironmentProps {
  fogColor?: string;
  groundRadius?: number;
}

/**
 * V22 Cinematic Environment & Lighting Setup
 * Delivers professional enterprise architectural lighting with high-fidelity depth,
 * soft shadows, ambient fill, and restrained atmosphere.
 */
export function CinematicEnvironment({
  groundRadius = 140,
}: CinematicEnvironmentProps) {
  const { settings } = useAdaptivePerformance();

  // Create memoized architectural ground grid geometry
  const gridColors = useMemo(() => {
    return {
      primary: '#334155',
      secondary: '#1e293b',
      accent: '#0284c7',
    };
  }, []);

  return (
    <group name="cinematic-environment">
      {/* 1. Global Ambient Base */}
      <ambientLight intensity={settings.shadows ? 0.45 : 0.7} color="#cbd5e1" />

      {/* 2. Key Sun Directional Light (Warm Corporate Sunlight) */}
      <directionalLight
        position={[45, 65, 35]}
        intensity={1.35}
        color="#fffbeb"
        castShadow={settings.shadows}
        shadow-mapSize-width={settings.shadowMapSize}
        shadow-mapSize-height={settings.shadowMapSize}
        shadow-camera-near={10}
        shadow-camera-far={180}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0004}
      />

      {/* 3. Cool Skylight Fill (Soft Architectural Contrast) */}
      <directionalLight
        position={[-35, 30, -25]}
        intensity={0.45}
        color="#93c5fd"
      />

      {/* 4. Subtle Upward Plaza Bounce / Rim Light */}
      <directionalLight
        position={[0, -10, 0]}
        intensity={0.15}
        color="#38bdf8"
      />

      {/* 5. Hemisphere Light (Sky vs Ground Natural Gradient) */}
      <hemisphereLight
        args={['#38bdf8', '#090d16', 0.55]}
      />

      {/* 6. Landscape Ground Plaza & Roads */}
      <group position={[0, -0.05, 0]}>
        {/* Main campus plaza baseplate */}
        <mesh receiveShadow={settings.shadows} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[groundRadius, groundRadius]} />
          <meshStandardMaterial
            color="#090d16"
            roughness={0.88}
            metalness={0.12}
          />
        </mesh>

        {/* Outer perimeter access ring / boulevard */}
        <mesh receiveShadow={settings.shadows} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[28, 48, 64]} />
          <meshStandardMaterial
            color="#111827"
            roughness={0.8}
            metalness={0.2}
          />
        </mesh>

        {/* Central corporate courtyard pavers */}
        <mesh receiveShadow={settings.shadows} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[24, 64]} />
          <meshStandardMaterial
            color="#0f172a"
            roughness={0.65}
            metalness={0.25}
          />
        </mesh>

        {/* Architectural Pedestrian Walkway Accents */}
        {[-16, 16].map((offset) => (
          <mesh
            key={`walkway-${offset}`}
            receiveShadow={settings.shadows}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[offset, 0.025, 0]}
          >
            <planeGeometry args={[2.5, 48]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} />
          </mesh>
        ))}

        {/* Ambient Ground Grid Lines */}
        <gridHelper
          args={[120, 60, gridColors.primary, gridColors.secondary]}
          position={[0, 0.03, 0]}
        />

        {/* Subdued perimeter orientation ring (subtle luminous compass) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <ringGeometry args={[23.8, 24.1, 64]} />
          <meshBasicMaterial
            color={gridColors.accent}
            transparent
            opacity={0.35}
          />
        </mesh>
      </group>
    </group>
  );
}
