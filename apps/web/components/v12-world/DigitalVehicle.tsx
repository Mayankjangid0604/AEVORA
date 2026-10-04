import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vehicle } from '@aevora/shared';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface DigitalVehicleProps {
  entity: Vehicle;
  isSelected?: boolean;
}

export function DigitalVehicle({ entity, isSelected }: DigitalVehicleProps) {
  const groupRef = useRef<THREE.Group>(null);
  
  const wheelRefs = [
    useRef<THREE.Mesh>(null), // front left
    useRef<THREE.Mesh>(null), // front right
    useRef<THREE.Mesh>(null), // rear left
    useRef<THREE.Mesh>(null), // rear right
  ];

  const isMoving = entity.movement?.movementState === 'MOVING';
  const isExecutive = ['EXECUTIVE', 'CHAIRMAN', 'CEO', 'MD'].includes(entity.vehicleClass || '');

  // Basic deterministic color based on ID
  const hash = entity.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = ['#1d4ed8', '#047857', '#b45309', '#be123c', '#4338ca', '#374151', '#f87171'];
  // Executive vehicles are sleek black/dark gray
  const bodyColor = isExecutive ? '#0a0a0a' : colors[hash % colors.length];
  
  // Executive vehicles might be slightly longer
  const bodyLength = isExecutive ? 2.8 : 2.5;

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    if (isMoving) {
      // Wheel spinning animation
      const spin = time * 10; 
      wheelRefs.forEach(ref => {
        if (ref.current) {
          ref.current.rotation.x = spin;
        }
      });
      
      // Slight body bobbing when moving
      if (groupRef.current) {
        groupRef.current.position.y = Math.sin(time * 20) * 0.02;
      }
    } else {
      if (groupRef.current) {
        groupRef.current.position.y = 0;
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.4, 0]}>
      {/* Floating Label */}
      {isSelected && (
        <Text 
          position={[0, 1.5, 0]} 
          fontSize={0.3} 
          color="white" 
          anchorX="center" 
          anchorY="bottom"
          outlineWidth={0.03}
          outlineColor="black"
        >
          {entity.name}
          {'\n'}
          <tspan fontSize={0.2} fill="#9ca3af">
            {entity.vehicleClass ? entity.vehicleClass : 'Company Vehicle'}
          </tspan>
          {'\n'}
          {entity.occupants && entity.occupants.length > 0 && (
            <tspan fontSize={0.15} fill="#6ee7b7">
              Occupants: {entity.occupants.length}
            </tspan>
          )}
        </Text>
      )}

      {/* Main Body */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.2, 0.4, bodyLength]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Cabin (Top) - With transparent glass so interior is visible */}
      <mesh position={[0, 0.65, -0.2]}>
        <boxGeometry args={[1.0, 0.4, 1.4]} />
        <meshStandardMaterial color="#1e293b" opacity={0.5} transparent depthWrite={false} />
      </mesh>

      {/* Interior Elements */}
      <group position={[0, 0.45, -0.2]}>
        {/* Front Seats */}
        <mesh position={[-0.25, 0.05, 0.3]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color={isExecutive ? "#f59e0b" : "#475569"} /> {/* Executive leather vs cloth */}
        </mesh>
        <mesh position={[0.25, 0.05, 0.3]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color={isExecutive ? "#f59e0b" : "#475569"} />
        </mesh>
        
        {/* Rear Seats */}
        <mesh position={[0, 0.05, -0.4]}>
          <boxGeometry args={[0.9, 0.3, 0.4]} />
          <meshStandardMaterial color={isExecutive ? "#f59e0b" : "#475569"} />
        </mesh>

        {/* Center Console */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.8]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>

        {/* Steering Wheel (rough approximation) */}
        <mesh position={[-0.25, 0.15, 0.55]} rotation={[Math.PI / 8, 0, 0]}>
          <torusGeometry args={[0.1, 0.02, 8, 16]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>

      {/* Wheels */}
      <mesh ref={wheelRefs[0]} position={[-0.65, 0, bodyLength / 2 - 0.45]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      
      <mesh ref={wheelRefs[1]} position={[0.65, 0, bodyLength / 2 - 0.45]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <mesh ref={wheelRefs[2]} position={[-0.65, 0, -(bodyLength / 2 - 0.45)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <mesh ref={wheelRefs[3]} position={[0.65, 0, -(bodyLength / 2 - 0.45)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      
      {/* Headlights */}
      <mesh position={[-0.4, 0.3, bodyLength / 2 + 0.01]}>
        <boxGeometry args={[0.25, 0.15, 0.05]} />
        <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0.4, 0.3, bodyLength / 2 + 0.01]}>
        <boxGeometry args={[0.25, 0.15, 0.05]} />
        <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={1} />
      </mesh>
      
      {/* Taillights */}
      <mesh position={[-0.4, 0.3, -(bodyLength / 2 + 0.01)]}>
        <boxGeometry args={[0.25, 0.15, 0.05]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0.4, 0.3, -(bodyLength / 2 + 0.01)]}>
        <boxGeometry args={[0.25, 0.15, 0.05]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}
