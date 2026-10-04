import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Person } from '@aevora/shared';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface DigitalHumanProps {
  entity: Person;
  isSelected?: boolean;
}

export function DigitalHuman({ entity, isSelected }: DigitalHumanProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Mesh>(null);

  const isMoving = entity.movement?.movementState === 'MOVING';
  
  // Basic deterministic color based on ID
  const hash = entity.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const shirtColor = colors[hash % colors.length];

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    // Idle animation: subtle breathing
    if (torsoRef.current) {
      torsoRef.current.scale.y = 1 + Math.sin(time * 2) * 0.02;
    }

    if (isMoving) {
      // Walking animation
      const walkCycle = time * 8; // Speed of walking
      const swing = Math.sin(walkCycle) * 0.5;

      if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -swing;
      if (rightArmRef.current) rightArmRef.current.rotation.x = swing;
    } else {
      // Return to idle stance
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.9, 0]}>
      {/* Floating Label (Visible if selected or close) */}
      {isSelected && (
        <Text 
          position={[0, 1.2, 0]} 
          fontSize={0.2} 
          color="white" 
          anchorX="center" 
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="black"
        >
          {entity.name}
          {'\n'}
          <tspan fontSize={0.15} fill="#9ca3af">
            {(entity as any).role || 'Employee'}
          </tspan>
        </Text>
      )}

      {/* Head */}
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>

      {/* Torso */}
      <mesh ref={torsoRef} position={[0, 0.1, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.25]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>

      {/* Left Arm */}
      <group position={[-0.25, 0.3, 0]}>
        <mesh ref={leftArmRef} position={[0, -0.25, 0]}>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group position={[0.25, 0.3, 0]}>
        <mesh ref={rightArmRef} position={[0, -0.25, 0]}>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
      </group>

      {/* Left Leg */}
      <group position={[-0.1, -0.2, 0]}>
        <mesh ref={leftLegRef} position={[0, -0.3, 0]}>
          <boxGeometry args={[0.12, 0.6, 0.12]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* Right Leg */}
      <group position={[0.1, -0.2, 0]}>
        <mesh ref={rightLegRef} position={[0, -0.3, 0]}>
          <boxGeometry args={[0.12, 0.6, 0.12]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>
    </group>
  );
}
