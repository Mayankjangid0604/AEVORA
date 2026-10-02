import { MarketingContentModule } from '../marketing-content/marketing-content.module';
import { forwardRef } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
import { SimulationEngineService } from './simulation-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentModule } from '../agent/agent.module';
import { SurvivalModule } from '../survival/survival.module';
import { LeadGenModule } from '../lead-gen/lead-gen.module';
import { SalesOutreachModule } from '../sales-outreach/sales-outreach.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { BusinessLoopService } from './business-loop.service';
import { CeoModule } from '../ceo/ceo.module';
import { OperatingLoopModule } from '../operating-loop/operating-loop.module';

@Module({
  imports: [forwardRef(() => AgentModule), SurvivalModule, LeadGenModule, SalesOutreachModule, DeliveryModule, CeoModule, MarketingContentModule, OperatingLoopModule],
  controllers: [SimulationController],
  providers: [SimulationService, SimulationEngineService, BusinessLoopService, PrismaService],
  exports: [SimulationService, SimulationEngineService, BusinessLoopService],
})
export class SimulationModule {}
