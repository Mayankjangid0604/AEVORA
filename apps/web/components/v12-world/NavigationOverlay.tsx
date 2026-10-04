import React, { useMemo } from 'react';
import { TopologyEdge, NavigationNode } from '@aevora/shared';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

interface NavigationOverlayProps {
  topology: TopologyEdge[];
  nodes: NavigationNode[];
}

export function NavigationOverlay({ topology, nodes }: NavigationOverlayProps) {
  
  const edgesData = useMemo(() => {
    const nodeMap = new Map<string, NavigationNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    const lines: { start: [number, number, number], end: [number, number, number], color: string }[] = [];
    
    topology.forEach(edge => {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);
      
      if (source && target) {
        lines.push({
          start: [source.position.x, source.position.y, source.position.z],
          end: [target.position.x, target.position.y, target.position.z],
          color: edge.isEnabled ? '#f59e0b' : '#ef4444' // amber for enabled, red for disabled
        });
      }
    });

    return lines;
  }, [topology, nodes]);

  return (
    <group>
      {/* Render Nodes */}
      {nodes.map(node => (
        <mesh key={node.id} position={[node.position.x, node.position.y, node.position.z]}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshBasicMaterial color={node.isTraversable ? '#10b981' : '#ef4444'} />
        </mesh>
      ))}

      {/* Render Edges */}
      {edgesData.map((edge, idx) => (
        <Line 
          key={idx}
          points={[edge.start, edge.end]}
          color={edge.color}
          lineWidth={2}
          dashed={false}
        />
      ))}
    </group>
  );
}
