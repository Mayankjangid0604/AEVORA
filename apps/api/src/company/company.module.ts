import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SpatialModule } from '../spatial/spatial.module';
import { WorldStateGatewayModule } from '../world-state-gateway/world-state-gateway.module';

@Module({
  imports: [PrismaModule, SpatialModule, WorldStateGatewayModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
