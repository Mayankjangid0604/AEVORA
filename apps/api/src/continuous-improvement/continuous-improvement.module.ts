import { Module } from '@nestjs/common';
import { ContinuousImprovementController } from './continuous-improvement.controller';
import { ContinuousImprovementService } from './continuous-improvement.service';
import { AntiEntropyEngineService } from './anti-entropy-engine.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { EnterpriseIntelligenceModule } from '../enterprise-intelligence/enterprise-intelligence.module';
import { GovernanceModule } from '../governance/governance.module';

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    EnterpriseIntelligenceModule,
    GovernanceModule,
  ],
  controllers: [ContinuousImprovementController],
  providers: [ContinuousImprovementService, AntiEntropyEngineService],
  exports: [ContinuousImprovementService, AntiEntropyEngineService],
})
export class ContinuousImprovementModule {}
