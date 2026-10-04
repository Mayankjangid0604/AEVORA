import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { WorldStateGatewayController } from './world-state-gateway.controller';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateRealtimeGateway } from './world-state-realtime.gateway';
import { WorldStateGatewayWorker } from './world-state-gateway.worker';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [WorldStateGatewayController],
  providers: [WorldStateGatewayService, WorldStateRealtimeGateway, WorldStateGatewayWorker],
  exports: [WorldStateGatewayService],
})
export class WorldStateGatewayModule {}
