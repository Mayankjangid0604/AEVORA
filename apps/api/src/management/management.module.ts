import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalModule } from '../approval/approval.module';
import { ManagementAuditService } from './management-audit.service';
import { CompanyStateService } from './company-state.service';
import { CompanyHealthService } from './company-health.service';
import { CompanyObjectiveService } from './company-objective.service';
import { CompanyKpiService } from './company-kpi.service';
import { ExecutiveDecisionService } from './executive-decision.service';
import { CompanyRiskService } from './company-risk.service';
import { CompanyOpportunityService } from './company-opportunity.service';
import { EscalationService } from './escalation.service';
import { ResourceAllocationService } from './resource-allocation.service';
import { OrganizationalMemoryService } from './organizational-memory.service';
import { ManagementCycleService } from './management-cycle.service';
import { ManagementController } from './management.controller';

@Module({
  imports: [PrismaModule, ApprovalModule],
  controllers: [ManagementController],
  providers: [
    ManagementAuditService,
    CompanyStateService,
    CompanyHealthService,
    CompanyObjectiveService,
    CompanyKpiService,
    ExecutiveDecisionService,
    CompanyRiskService,
    CompanyOpportunityService,
    EscalationService,
    ResourceAllocationService,
    OrganizationalMemoryService,
    ManagementCycleService,
  ],
  exports: [
    ManagementAuditService,
    CompanyStateService,
    CompanyHealthService,
    CompanyObjectiveService,
    CompanyKpiService,
    ExecutiveDecisionService,
    CompanyRiskService,
    CompanyOpportunityService,
    EscalationService,
    ResourceAllocationService,
    OrganizationalMemoryService,
    ManagementCycleService,
  ],
})
export class ManagementModule {}
