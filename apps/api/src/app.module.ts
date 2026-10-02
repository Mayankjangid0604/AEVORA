import { Module } from '@nestjs/common';
import { OutreachModule } from './outreach/outreach.module';
import { LeadGenModule } from './lead-gen/lead-gen.module';
import { SalesOutreachModule } from './sales-outreach/sales-outreach.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SurvivalModule } from './survival/survival.module';
import { VoiceAssistantModule } from './voice-assistant/voice-assistant.module';
import { BoardroomModule } from './boardroom/boardroom.module';
import { OfficeScreensModule } from './office-screens/office-screens.module';
import { MonthlyModule } from './monthly/monthly.module';
import { CurrencyModule } from './currency/currency.module';
import { VenturesModule } from './ventures/ventures.module';
import { HealthController } from './health.controller';
import { EconomyModule } from './economy/economy.module';
import { CompanyModule } from './company/company.module';
import { DepartmentModule } from './department/department.module';
import { EmployeeModule } from './employee/employee.module';
import { RoleModule } from './role/role.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AgentModule } from './agent/agent.module';
import { GoalModule } from './goal/goal.module';
import { TaskModule } from './task/task.module';
import { WorkloadModule } from './workload/workload.module';
import { PerformanceModule } from './performance/performance.module';
import { SimulationModule } from './simulation/simulation.module';
import { InquiryModule } from './inquiry/inquiry.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { ProposalModule } from './proposal/proposal.module';
import { ProjectModule } from './project/project.module';
import { ReceptionistModule } from './receptionist/receptionist.module';
import { ClientModule } from './client/client.module';
import { CrmModule } from './crm/crm.module';

import { PrismaModule } from './prisma/prisma.module';
import { ProjectExecutionModule } from './project-execution/project-execution.module';
import { CompanyOperationsModule } from './company-operations/company-operations.module';
import { ChairmanModule } from './chairman/chairman.module';
import { CommunicationModule } from './communication/communication.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { ResearchModule } from './research/research.module';
import { ComputeModule } from './compute/compute.module';
import { IntegrationModule } from './integration/integration.module';
import { JobModule } from './job/job.module';
import { ApprovalModule } from './approval/approval.module';
import { InvoiceModule } from './invoice/invoice.module';
import { LoggerModule } from './logger/logger.module';
import { ProductionModule } from './production/production.module';
import { FinanceModule } from './finance/finance.module';
import { SalesModule } from './sales/sales.module';
import { CustomerOperationsModule } from './customer-operations/customer-operations.module';
import { MarketingModule } from './marketing/marketing.module';
import { WorkforceModule } from './workforce/workforce.module';
import { ManagementModule } from './management/management.module';
import { StrategyModule } from './strategy/strategy.module';
import { LabModule } from './lab/lab.module';
import { ModelPlatformModule } from './model-platform/model-platform.module';
import { ProductFactoryModule } from './product-factory/product-factory.module';
import { BusinessUnitsModule } from './business-units/business-units.module';
import { CapitalAllocationModule } from './capital-allocation/capital-allocation.module';
import { GlobalOperationsModule } from './global-operations/global-operations.module';
import { FoundationIntelligenceModule } from './foundation-intelligence/foundation-intelligence.module';
import { RdFlywheelModule } from './rd-flywheel/rd-flywheel.module';
import { AutonomousEnterpriseModule } from './autonomous-enterprise/autonomous-enterprise.module';
import { OperatingLoopModule } from './operating-loop/operating-loop.module';
import { DevicesModule } from './devices/devices.module';
import { WorldEngineModule } from './world-engine/world-engine.module';
import { CeoModule } from './ceo/ceo.module';
import { AssistantModule } from './assistant/assistant.module';
import { OrganizationModule } from './organization/organization.module';
import { IdeasModule } from './ideas/ideas.module';
import { MarketingContentModule } from './marketing-content/marketing-content.module';
import { VoiceModule } from './voice/voice.module';
import { ChairmanMailModule } from './notifications/chairman-mail.module';
import { BrowserAiModule } from './browser-ai/browser-ai.module';

@Module({
  imports: [
    PrismaModule,
    EconomyModule,
    CompanyModule,
    DepartmentModule,
    EmployeeModule,
    RoleModule,
    AuthorizationModule,
    AgentModule,
    GoalModule,
    TaskModule,
    WorkloadModule,
    PerformanceModule,
    SimulationModule,
    ClientModule,
    CrmModule,
    InquiryModule,
    OpportunityModule,
    ProposalModule,
    ProjectModule,
    ReceptionistModule,
    ProjectExecutionModule,
    CompanyOperationsModule,
    ChairmanModule,
    DevicesModule,
    CommunicationModule,
    KnowledgeModule,
    IntelligenceModule,
    ResearchModule,
    ComputeModule,
    IntegrationModule,
    JobModule,
    ApprovalModule,
    InvoiceModule,
    LoggerModule,
    ProductionModule,
    FinanceModule,
    SalesModule,
    CustomerOperationsModule,
    MarketingModule,
    WorkforceModule,
    ManagementModule,
    StrategyModule,
    LabModule,
    ModelPlatformModule,
    ProductFactoryModule,
    BusinessUnitsModule,
    CapitalAllocationModule,
    GlobalOperationsModule,
    FoundationIntelligenceModule,
    RdFlywheelModule,
    AutonomousEnterpriseModule,
    OperatingLoopModule,
    OutreachModule,
    LeadGenModule,
    SalesOutreachModule,
    DeliveryModule,
    SurvivalModule,
    VoiceAssistantModule,
    BoardroomModule,
    OfficeScreensModule,
    MonthlyModule,
    CurrencyModule,
    VenturesModule,
    WorldEngineModule,
    CeoModule,
    OrganizationModule,
    AssistantModule,
    IdeasModule,
    MarketingContentModule,
    VoiceModule,
    ChairmanMailModule,
    BrowserAiModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
