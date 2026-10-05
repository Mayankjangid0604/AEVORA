import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { ContinuousImprovementModule } from '../continuous-improvement/continuous-improvement.module';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { CeoModule } from '../ceo/ceo.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    IntelligenceModule,
    ContinuousImprovementModule,
    forwardRef(() => CeoModule),
  ],
  providers: [EnterpriseOrchestratorService],
  exports: [EnterpriseOrchestratorService],
})
export class AutomationOrchestrationModule {}
