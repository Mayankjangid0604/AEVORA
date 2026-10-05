const path = require('path');
const { PrismaClient } = require('@prisma/client');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}

const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING V12 NAVIGATION GRAPH ---');

  const rooms = await prisma.v12SpatialRoom.findMany({
    include: { floor: { include: { building: true } } }
  });
  console.log(`Found ${rooms.length} rooms to create navigation nodes for.`);

  const nodeMap = new Map();

  for (const room of rooms) {
    let node = await prisma.v12NavigationNode.findFirst({
      where: { entityId: room.id }
    });

    if (!node) {
      node = await prisma.v12NavigationNode.create({
        data: {
          entityId: room.id,
          entityType: 'ROOM',
          posX: room.posX,
          posY: room.posY,
          posZ: room.posZ,
          floorId: room.floorId,
          buildingId: room.floor?.buildingId,
          nodeType: room.type === 'CORRIDOR' ? 'CORRIDOR' : 'ROOM',
          isTraversable: true
        }
      });
    }
    nodeMap.set(room.id, node);
  }

  // Connect rooms on the same floor via Corridor
  const floors = await prisma.v12SpatialFloor.findMany();
  for (const floor of floors) {
    const floorRooms = rooms.filter(r => r.floorId === floor.id);
    const corridor = floorRooms.find(r => r.type === 'CORRIDOR') || floorRooms[0];
    if (!corridor) continue;
    const corridorNode = nodeMap.get(corridor.id);

    for (const room of floorRooms) {
      if (room.id === corridor.id) continue;
      const roomNode = nodeMap.get(room.id);
      if (!roomNode || !corridorNode) continue;

      // Create bidirectional edges
      const edge1 = await prisma.v12SpatialTopologyEdge.findFirst({
        where: { sourceId: corridorNode.id, targetId: roomNode.id }
      });
      if (!edge1) {
        await prisma.v12SpatialTopologyEdge.create({
          data: {
            sourceId: corridorNode.id,
            sourceType: 'NAVIGATION_NODE',
            targetId: roomNode.id,
            targetType: 'NAVIGATION_NODE',
            distance: 5.0,
            traversalType: 'DOORWAY',
            isEnabled: true
          }
        });
      }

      const edge2 = await prisma.v12SpatialTopologyEdge.findFirst({
        where: { sourceId: roomNode.id, targetId: corridorNode.id }
      });
      if (!edge2) {
        await prisma.v12SpatialTopologyEdge.create({
          data: {
            sourceId: roomNode.id,
            sourceType: 'NAVIGATION_NODE',
            targetId: corridorNode.id,
            targetType: 'NAVIGATION_NODE',
            distance: 5.0,
            traversalType: 'DOORWAY',
            isEnabled: true
          }
        });
      }
    }
  }

  // Connect floor corridors within each building (e.g. Ground Corridor <-> Exec Corridor)
  const corridors = rooms.filter(r => r.type === 'CORRIDOR');
  for (let i = 0; i < corridors.length; i++) {
    for (let j = i + 1; j < corridors.length; j++) {
      const c1 = corridors[i];
      const c2 = corridors[j];
      if (c1.floor?.buildingId && c2.floor?.buildingId && c1.floor.buildingId === c2.floor.buildingId) {
        const n1 = nodeMap.get(c1.id);
        const n2 = nodeMap.get(c2.id);
        if (!n1 || !n2) continue;

        const e1 = await prisma.v12SpatialTopologyEdge.findFirst({
          where: { sourceId: n1.id, targetId: n2.id }
        });
        if (!e1) {
          await prisma.v12SpatialTopologyEdge.create({
            data: {
              sourceId: n1.id,
              sourceType: 'NAVIGATION_NODE',
              targetId: n2.id,
              targetType: 'NAVIGATION_NODE',
              distance: 10.0,
              traversalType: 'ELEVATOR',
              isEnabled: true
            }
          });
        }

        const e2 = await prisma.v12SpatialTopologyEdge.findFirst({
          where: { sourceId: n2.id, targetId: n1.id }
        });
        if (!e2) {
          await prisma.v12SpatialTopologyEdge.create({
            data: {
              sourceId: n2.id,
              sourceType: 'NAVIGATION_NODE',
              targetId: n1.id,
              targetType: 'NAVIGATION_NODE',
              distance: 10.0,
              traversalType: 'ELEVATOR',
              isEnabled: true
            }
          });
        }
      }
    }
  }

  const nodeCount = await prisma.v12NavigationNode.count();
  const edgeCount = await prisma.v12SpatialTopologyEdge.count();
  console.log(`[+] Navigation Graph Seeded: ${nodeCount} nodes, ${edgeCount} edges`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
