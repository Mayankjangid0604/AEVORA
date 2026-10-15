import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationRegistryService } from './automation-registry.service';
import { N8nClientService } from './n8n-client.service';
import { LeadNormalizerService } from './lead-normalizer.service';
import { AutomationController } from './automation.controller';
import { IntegrationApiKeyGuard } from '../authorization/integration-api-key.guard';

@Module({
  imports: [PrismaModule],
  providers: [
    AutomationRegistryService,
    N8nClientService,
    LeadNormalizerService,
    IntegrationApiKeyGuard,
  ],
  controllers: [AutomationController],
  exports: [
    AutomationRegistryService,
    N8nClientService,
    LeadNormalizerService,
  ],
})
export class AutomationModule {}
