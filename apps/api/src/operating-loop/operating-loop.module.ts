import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatingLoopService } from './operating-loop.service';
import { ActionDispatchService } from './action-dispatch.service';
import { OpportunitySignalService } from './opportunity-signal.service';
import { MemoryIntegrationService } from './memory-integration.service';
import { PerformanceAggregationService } from './performance-aggregation.service';
import { OperatingLoopController } from './operating-loop.controller';
import { ItlErrorPoolService } from './itl-error-pool.service';

@Module({
  imports: [PrismaModule],
  controllers: [OperatingLoopController],
  providers: [
    ActionDispatchService,
    OperatingLoopService,
    OpportunitySignalService,
    MemoryIntegrationService,
    PerformanceAggregationService,
    ItlErrorPoolService,
  ],
  exports: [
    OperatingLoopService,
    OpportunitySignalService,
    MemoryIntegrationService,
    PerformanceAggregationService,
    ItlErrorPoolService,
  ],
})
export class OperatingLoopModule {}
