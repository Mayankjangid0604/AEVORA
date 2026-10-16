import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationRegistryService } from './automation-registry.service';
import { N8nClientService } from './n8n-client.service';
import { LeadNormalizerService } from './lead-normalizer.service';
import { WebsiteExtractorService } from './website-extractor.service';
import { EmailVerifierService } from './email-verifier.service';
import { OllamaClientService } from './ollama-client.service';
import { LeadEnrichmentService } from './lead-enrichment.service';
import { OpportunityScoringEngine } from './opportunity-scoring.engine';
import { SalesResearchService } from './sales-research.service';
import { SalesOutreachService } from './sales-outreach.service';
import { AutomationController } from './automation.controller';
import { IntegrationApiKeyGuard } from '../authorization/integration-api-key.guard';

@Module({
  imports: [PrismaModule],
  providers: [
    AutomationRegistryService,
    N8nClientService,
    LeadNormalizerService,
    WebsiteExtractorService,
    EmailVerifierService,
    OllamaClientService,
    LeadEnrichmentService,
    OpportunityScoringEngine,
    SalesResearchService,
    SalesOutreachService,
    IntegrationApiKeyGuard,
  ],
  controllers: [AutomationController],
  exports: [
    AutomationRegistryService,
    N8nClientService,
    LeadNormalizerService,
    WebsiteExtractorService,
    EmailVerifierService,
    OllamaClientService,
    LeadEnrichmentService,
    OpportunityScoringEngine,
    SalesResearchService,
    SalesOutreachService,
  ],
})
export class AutomationModule {}
