"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const company_module_1 = require("./src/company/company.module");
const company_service_1 = require("./src/company/company.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
async function run() {
    const app = await core_1.NestFactory.createApplicationContext(company_module_1.CompanyModule);
    const companyService = app.get(company_service_1.CompanyService);
    const prisma = app.get(prisma_service_1.PrismaService);
    let u = await prisma.chairman.findFirst();
    if (!u) {
        u = await prisma.user.create({ data: {
                email: `test-${Date.now()}@example.com`,
                passwordHash: 'dummy',
                name: 'Test User'
            } });
    }
    console.log('Creating Test Company...');
    const company = await companyService.createCompany('Global Corp ' + Date.now(), 'Global Corp LLC', 'Test', u.id);
    console.log('Company created:', company.id);
    return;
    await new Promise(r => setTimeout(r, 2000));
    const site = await prisma.v12SpatialSite.findFirst({ where: { companyId: company.id } });
    console.log('Site found:', !!site);
    if (site) {
        const buildings = await prisma.v12SpatialBuilding.findMany({ where: { siteId: site.id } });
        console.log('Buildings:', buildings.map(b => b.name));
        for (const b of buildings) {
            const floors = await prisma.v12SpatialFloor.findMany({ where: { buildingId: b.id }, orderBy: { level: 'asc' } });
            console.log('  Floors:', floors.map(f => f.name));
            for (const f of floors) {
                const rooms = await prisma.v12SpatialRoom.findMany({ where: { floorId: f.id } });
                console.log(`    [${f.name}] Rooms:`, rooms.map(r => r.name));
            }
        }
    }
    await app.close();
}
run().catch(console.error);
//# sourceMappingURL=test_reconciliation.js.map