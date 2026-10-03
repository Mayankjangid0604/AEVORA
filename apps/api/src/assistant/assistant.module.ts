import { Module } from '@nestjs/common';
import { CompanyIntelligenceModule } from '../company-intelligence/company-intelligence.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { ResponseCacheService } from './response-cache.service';
import { BriefingService } from './briefing.service';
import { ProactiveAlertService } from './proactive-alert.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DevicesModule } from '../devices/devices.module';
import { SimulationModule } from '../simulation/simulation.module';
import { CeoModule } from '../ceo/ceo.module';
import { LeadGenModule } from '../lead-gen/lead-gen.module';
import { IdeasModule } from '../ideas/ideas.module';
import { MarketingContentModule } from '../marketing-content/marketing-content.module';
import { SalesOutreachModule } from '../sales-outreach/sales-outreach.module';
import { VoiceModule } from '../voice/voice.module';
import { BoardroomModule } from '../boardroom/boardroom.module';
import { CommunicationModule } from '../communication/communication.module';
import { ManagementModule } from '../management/management.module';
import { SalesModule } from '../sales/sales.module';
@Module({
  imports: [PrismaModule, DevicesModule, SimulationModule, CeoModule, LeadGenModule, IdeasModule, MarketingContentModule, SalesOutreachModule, VoiceModule, BoardroomModule, CommunicationModule, ManagementModule, SalesModule, CompanyIntelligenceModule],
  providers: [AssistantService, ResponseCacheService, BriefingService, ProactiveAlertService],
  controllers: [AssistantController],
  exports: [AssistantService, ResponseCacheService, BriefingService, ProactiveAlertService],
})
export class AssistantModule {}
