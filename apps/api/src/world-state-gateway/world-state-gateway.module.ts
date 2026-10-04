import { Module } from '@nestjs/common';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateEventTranslationService } from './world-state-translation.service';
import { WorldStateReplayService } from './world-state-replay.service';
import { ReplaySessionService } from './replay-session.service';
import { WorldStateGatewayController } from './world-state-gateway.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [WorldStateGatewayService, WorldStateEventService, WorldStateEventTranslationService, WorldStateReplayService, ReplaySessionService],
  controllers: [WorldStateGatewayController],
  exports: [WorldStateGatewayService, WorldStateEventService, WorldStateReplayService, ReplaySessionService],
})
export class WorldStateGatewayModule {}
