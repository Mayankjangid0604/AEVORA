import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../logger/logger.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ApprovalModule } from '../approval/approval.module';
import { SalesController } from './sales.controller';
import { SalesAuditService } from './sales-audit.service';
import { SalesLeadService } from './sales-lead.service';
import { TargetAccountService } from './target-account.service';
import { SalesOpportunityService } from './sales-opportunity.service';
import { SalesActivityService } from './sales-activity.service';
import { QualificationService } from './qualification.service';
import { OpportunityScoringService } from './opportunity-scoring.service';
import { SalesPipelineService } from './sales-pipeline.service';
import { ChairmanDecisionService } from './chairman-decision.service';
import { SalesAgentConfigService } from './sales-agent-config.service';

@Module({
  imports: [PrismaModule, LoggerModule, AuthorizationModule, ApprovalModule],
  controllers: [SalesController],
  providers: [
    SalesAuditService,
    SalesLeadService,
    TargetAccountService,
    SalesOpportunityService,
    SalesActivityService,
    QualificationService,
    OpportunityScoringService,
    SalesPipelineService,
    ChairmanDecisionService,
    SalesAgentConfigService,
  ],
  exports: [
    SalesAuditService,
    SalesLeadService,
    TargetAccountService,
    SalesOpportunityService,
    SalesActivityService,
    QualificationService,
    OpportunityScoringService,
    SalesPipelineService,
    ChairmanDecisionService,
    SalesAgentConfigService,
  ],
})
export class SalesModule {}
