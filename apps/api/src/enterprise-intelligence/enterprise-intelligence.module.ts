import { forwardRef, Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CeoModule } from '../ceo/ceo.module';
import { OrganizationalMemoryModule } from '../organizational-memory/organizational-memory.module';
import { CanonicalEnterpriseStateService } from './canonical-enterprise-state.service';
import { EnterpriseConflictIntegrityService } from './enterprise-conflict-integrity.service';
import { DigitalTwinScenarioService } from './digital-twin-scenario.service';
import { DigitalTwinReconciliationService } from './digital-twin-reconciliation.service';
import { EnterpriseStateHealthService } from './enterprise-state-health.service';
import { ContinuousReplanningService } from './continuous-replanning.service';
import { EnterpriseIntelligenceController } from './enterprise-intelligence.controller';

@Global()
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => CeoModule),
    forwardRef(() => OrganizationalMemoryModule),
  ],
  controllers: [EnterpriseIntelligenceController],
  providers: [
    CanonicalEnterpriseStateService,
    EnterpriseConflictIntegrityService,
    DigitalTwinScenarioService,
    DigitalTwinReconciliationService,
    EnterpriseStateHealthService,
    ContinuousReplanningService,
  ],
  exports: [
    CanonicalEnterpriseStateService,
    EnterpriseConflictIntegrityService,
    DigitalTwinScenarioService,
    DigitalTwinReconciliationService,
    EnterpriseStateHealthService,
    ContinuousReplanningService,
  ],
})
export class EnterpriseIntelligenceModule {}
