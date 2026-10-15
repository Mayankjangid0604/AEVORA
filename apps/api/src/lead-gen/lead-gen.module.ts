import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { LeadSearchService } from './lead-search.service';
import { LeadGenService } from './lead-gen.service';
import { LeadGenController } from './lead-gen.controller';
import { IntegrationApiKeyGuard } from '../authorization/integration-api-key.guard';

import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [DevicesModule, AutomationModule],
  providers: [LeadSearchService, LeadGenService, IntegrationApiKeyGuard],
  controllers: [LeadGenController],
  exports: [LeadGenService, LeadSearchService],
})
export class LeadGenModule {}
