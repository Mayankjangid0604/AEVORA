import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { WorldEntity, V12EntityType } from '@aevora/shared';

interface DynamicCameraProps {
  viewMode: string;
  entities: WorldEntity[];
  selectedEntityId: string | null;
}

export function DynamicCamera({ viewMode, entities, selectedEntityId }: DynamicCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const controlsRef = useRef<any>(null);

  const selectedEntity = selectedEntityId ? entities.find(e => e.id === selectedEntityId) : null;

  useFrame(() => {
    if (!cameraRef.current || !controlsRef.current) return;

    if (viewMode === 'vehicle-exterior' && selectedEntity && selectedEntity.type === V12EntityType.VEHICLE) {
      const { x, y, z } = selectedEntity.transform.position;
      // Chase camera: position a bit behind and above
      cameraRef.current.position.lerp(new THREE.Vector3(x, y + 3, z + 6), 0.1);
      controlsRef.current.target.lerp(new THREE.Vector3(x, y, z), 0.1);
      controlsRef.current.update();
    } else if (viewMode === 'vehicle-interior' && selectedEntity && selectedEntity.type === V12EntityType.VEHICLE) {
      const { x, y, z } = selectedEntity.transform.position;
      const { rotation } = selectedEntity.transform;
      
      const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      const euler = new THREE.Euler().setFromQuaternion(quat);
      
      // Inside the cabin, roughly front passenger or executive rear seat depending on class
      // For now, place it near the rear seats for "Executive View"
      const offset = new THREE.Vector3(0, y + 1.2, z - 0.4);
      // We would ideally rotate this offset by the vehicle's quaternion if it was turning
      
      cameraRef.current.position.lerp(offset, 0.2);
      
      // Look forward
      const target = new THREE.Vector3(x, y + 1.2, z + 5);
      controlsRef.current.target.lerp(target, 0.2);
      controlsRef.current.update();
    } else if (viewMode === 'third-person' && selectedEntity) {
      const { x, y, z } = selectedEntity.transform.position;
      cameraRef.current.position.lerp(new THREE.Vector3(x, y + 3, z + 4), 0.1);
      controlsRef.current.target.lerp(new THREE.Vector3(x, y + 1, z), 0.1);
      controlsRef.current.update();
    } else if (viewMode === 'follow' && selectedEntity) {
      const { x, y, z } = selectedEntity.transform.position;
      cameraRef.current.position.lerp(new THREE.Vector3(x, y + 2, z + 2), 0.15);
      controlsRef.current.target.lerp(new THREE.Vector3(x, y + 1, z), 0.15);
      controlsRef.current.update();
    } else if (viewMode === 'executive-focus' && selectedEntity) {
      const { x, y, z } = selectedEntity.transform.position;
      const { rotation } = selectedEntity.transform;
      // Assume entity faces -Z if rotation is identity. Let's position camera in front and slightly left
      cameraRef.current.position.lerp(new THREE.Vector3(x - 1, y + 1.6, z - 2), 0.05);
      controlsRef.current.target.lerp(new THREE.Vector3(x, y + 1.6, z), 0.05);
      controlsRef.current.update();
    } else if (viewMode === 'route-overview' && selectedEntity) {
      const { x, y, z } = selectedEntity.transform.position;
      cameraRef.current.position.lerp(new THREE.Vector3(x, y + 30, z + 30), 0.05);
      controlsRef.current.target.lerp(new THREE.Vector3(x, y, z), 0.05);
      controlsRef.current.update();
    }
  });

  if (viewMode === 'overhead') {
    return (
      <>
        <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={45} />
        <OrbitControls 
          target={[0, 0, 0]} 
          maxPolarAngle={Math.PI / 2 - 0.1}
          minDistance={10}
          maxDistance={200}
        />
      </>
    );
  }

  if (viewMode === 'explore') {
    return (
      <>
        <PerspectiveCamera makeDefault position={[0, 10, 20]} fov={60} />
        <OrbitControls 
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={2}
          maxDistance={100}
        />
      </>
    );
  }

  if (viewMode === 'first-person') {
    return (
      <>
        <PerspectiveCamera makeDefault position={[0, 1.7, 0]} fov={75} />
        <OrbitControls 
          target={[0, 1.7, -1]} 
          maxPolarAngle={Math.PI} 
          minDistance={0.1} 
          maxDistance={0.1} 
          enablePan={false}
          enableZoom={false}
        />
      </>
    );
  }

  // Fallback / dynamic modes (vehicle-exterior, vehicle-interior)
  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 10, 20]} fov={60} />
      <OrbitControls ref={controlsRef} target={[0, 0, 0]} />
    </>
  );
}
