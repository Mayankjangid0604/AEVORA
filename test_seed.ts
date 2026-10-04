import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/api/src/app.module';
import { V12SpatialService } from './apps/api/src/v12-spatial/v12-spatial.service';
import { WorldStateGatewayService } from './apps/api/src/world-state-gateway/world-state-gateway.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const spatialService = app.get(V12SpatialService);
  const gatewayService = app.get(WorldStateGatewayService);
  
  console.log('Seeding...');
  await spatialService.seedSaahvikWorld();
  
  console.log('Seeding done. Testing snapshot generation...');
  
  // We need a company ID for the snapshot, let's grab the first one
  const { PrismaService } = require('./apps/api/src/prisma/prisma.service');
  const prisma = app.get(PrismaService);
  const company = await prisma.company.findFirst();
  
  if (company) {
      const snapshot = await gatewayService.generateSnapshot(company.id);
      console.log(`Snapshot entities: ${Object.keys(snapshot.entities).length}`);
      // Find campus
      const campus = Object.values(snapshot.entities).find(e => e.type === 'CAMPUS');
      console.log('Campus found:', campus?.name);
  } else {
      console.log('No company found to test snapshot.');
  }

  await app.close();
}

bootstrap().catch(console.error);
