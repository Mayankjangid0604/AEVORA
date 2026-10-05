"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function run() {
    const prisma = new client_1.PrismaClient();
    const company = await prisma.company.findFirst({ where: { name: { startsWith: 'Global Corp' } }, orderBy: { name: 'desc' } });
    if (company) {
        console.log('Latest Company:', company.name);
        const site = await prisma.v12SpatialSite.findFirst({ where: { companyId: company.id } });
        if (site) {
            console.log('Site found:', site.name);
            const buildings = await prisma.v12SpatialBuilding.findMany({ where: { siteId: site.id } });
            console.log('Buildings:', buildings.map(b => b.name));
            for (const b of buildings) {
                const floors = await prisma.v12SpatialFloor.findMany({ where: { buildingId: b.id }, orderBy: { level: 'asc' } });
                console.log('  Floors:', floors.map(f => f.name));
                for (const f of floors) {
                    const rooms = await prisma.v12SpatialRoom.findMany({ where: { floorId: f.id } });
                    console.log(`    [${f.name}] Rooms:`, rooms.map(r => r.name));
                    for (const r of rooms) {
                        const workspaces = await prisma.v12SpatialWorkspace.findMany({ where: { roomId: r.id } });
                        if (workspaces.length) {
                            console.log(`      Workspaces:`, workspaces.map(w => w.name));
                        }
                    }
                }
            }
        }
        else {
            console.log('No site found.');
        }
    }
}
run();
//# sourceMappingURL=check_db.js.map