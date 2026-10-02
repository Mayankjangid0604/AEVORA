import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { WeWorldEventService } from './we-world-event.service';
import { WeMarketStateService } from './we-market-state.service';
import { WeInterpretationService } from './we-interpretation.service';
import { WeSimulationBridgeService } from './we-simulation-bridge.service';
import { WorldEngineController } from './world-engine.controller';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [WorldEngineController],
  providers: [
    WeWorldEventService,
    WeMarketStateService,
    WeInterpretationService,
    WeSimulationBridgeService,
  ],
  exports: [WeWorldEventService, WeMarketStateService, WeInterpretationService, WeSimulationBridgeService],
})
export class WorldEngineModule {}
