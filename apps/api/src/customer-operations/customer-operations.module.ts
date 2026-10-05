import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CustomerLifecycleService } from './customer-lifecycle.service';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { StaffingService } from './staffing.service';
import { CustomerAcceptanceService } from './customer-acceptance.service';
import { ProjectEconomicsService } from './project-economics.service';
import { CustomerHealthService } from './customer-health.service';
import { CustomerCommunicationService } from './customer-communication.service';
import { Phase25AgentService } from './phase25-agent.service';
import { CustomerOperationsController } from './customer-operations.controller';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [CustomerOperationsController],
  providers: [
    CustomerLifecycleService,
    CustomerOnboardingService,
    ProjectLifecycleService,
    StaffingService,
    CustomerAcceptanceService,
    ProjectEconomicsService,
    CustomerHealthService,
    CustomerCommunicationService,
    Phase25AgentService,
  ],
  exports: [
    CustomerLifecycleService,
    ProjectLifecycleService,
    CustomerAcceptanceService,
    ProjectEconomicsService,
  ],
})
export class CustomerOperationsModule {}
