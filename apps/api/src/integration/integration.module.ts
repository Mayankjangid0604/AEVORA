import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { SandboxEmailProvider } from './providers/sandbox-email.provider';
import { ProductionEmailProvider } from './providers/production-email.provider';
import { LocalTestResearchProvider } from './providers/local-test-research.provider';
import { ExternalSearchProvider } from './providers/external-search.provider';
import { ResearchIntegrationService } from './research-integration.service';
import { IntegrationController } from './integration.controller';

@Module({
  providers: [IntegrationService, SandboxEmailProvider, ProductionEmailProvider, LocalTestResearchProvider, ExternalSearchProvider, ResearchIntegrationService],
  controllers: [IntegrationController],
  exports: [IntegrationService, ResearchIntegrationService],
})
export class IntegrationModule {}
