import * as fs from 'fs';
import * as path from 'path';
import { parseEnv } from 'util';

try {
  const parsed = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../../.env'), 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v as string;
  }
} catch (e: any) {
  console.warn('Could not load .env file from root', e.message);
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { V12SpatialService } from '../src/v12-spatial/v12-spatial.service';
import { V12VehicleService } from '../src/v12-spatial/v12-vehicle.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  console.log('--- RECONCILING V12 SPATIAL WORLD AND VEHICLES ---');
  const app = await NestFactory.createApplicationContext(AppModule);
  const spatialService = app.get(V12SpatialService);
  const vehicleService = app.get(V12VehicleService);
  const prisma = app.get(PrismaService);

  // 1. Seed Saahvik World
  console.log('[1] Seeding Saahvik World base geography...');
  await spatialService.seedSaahvikWorld();

  // 2. Reconcile all active companies
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' } });
  console.log(`[2] Found ${companies.length} active companies. Reconciling...`);
  for (const company of companies) {
    console.log(`Reconciling company ${company.name} (${company.id})...`);
    await spatialService.reconcileCompanySpatialPresence(company.id);

    // Reconcile vehicles for all employees
    const employees = await prisma.employee.findMany({ where: { companyId: company.id } });
    console.log(`Creating vehicles for ${employees.length} employees...`);
    for (const emp of employees) {
      try {
        await vehicleService.createVehicleForEmployee(emp.id);
      } catch (err: any) {
        console.warn(`Could not create vehicle for ${emp.name}: ${err.message}`);
      }
    }
  }

  // Check counts
  const sites = await prisma.v12SpatialSite.count();
  const buildings = await prisma.v12SpatialBuilding.count();
  const rooms = await prisma.v12SpatialRoom.count();
  const workspaces = await prisma.v12SpatialWorkspace.count();
  const vehicles = await prisma.v12SpatialVehicle.count();
  console.log(`[+] Spatial Reconciliation complete:
    Sites: ${sites}
    Buildings: ${buildings}
    Rooms: ${rooms}
    Workspaces: ${workspaces}
    Vehicles: ${vehicles}
  `);

  await app.close();
}

bootstrap().catch(err => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
