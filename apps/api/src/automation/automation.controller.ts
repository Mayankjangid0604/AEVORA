import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import {
  IntegrationApiKeyGuard,
  IntegrationAuth,
} from '../authorization/integration-api-key.guard';
import { AutomationRegistryService } from './automation-registry.service';
import { N8nClientService } from './n8n-client.service';
import { LeadNormalizerService } from './lead-normalizer.service';
import { LeadFindingInput, RawGooglePlaceRecord } from './automation.types';

@Controller('automation')
@UseGuards(JwtAuthGuard, IntegrationApiKeyGuard, RolesGuard)
export class AutomationController {
  constructor(
    private readonly registry: AutomationRegistryService,
    private readonly n8nClient: N8nClientService,
    private readonly normalizer: LeadNormalizerService,
  ) {}

  /**
   * Lists all registered automations in AEVORA with operational status.
   */
  @Get('workflows')
  async listWorkflows() {
    const automations = this.registry.listAutomations();
    const n8nStatus = await this.n8nClient.getStatus();

    return automations.map((a) => ({
      ...a,
      n8nConnection: n8nStatus,
    }));
  }

  /**
   * Retrieves definition and configuration details for a specific automation.
   */
  @Get('workflows/:id')
  async getWorkflow(@Param('id') id: string) {
    const auto = this.registry.getAutomation(id);
    const n8nStatus = await this.n8nClient.getStatus();
    return {
      ...auto,
      n8nConnection: n8nStatus,
    };
  }

  /**
   * Probes external n8n connectivity.
   */
  @Get('n8n/status')
  async getN8nStatus() {
    return this.n8nClient.getStatus();
  }

  /**
   * Deploys the workflow definition JSON to the configured n8n instance.
   * Restricted to authorized company leadership.
   */
  @Post('workflows/:id/deploy')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async deployWorkflow(
    @Param('id') id: string,
    @Body() body: { activate?: boolean },
  ) {
    return this.n8nClient.deployWorkflow(id, { activate: body?.activate });
  }

  /**
   * Ingestion webhook endpoint for external n8n workflow or scraper callbacks.
   * Authenticated via service-to-service x-integration-key and x-company-id headers.
   */
  @Post('webhook/leads')
  @IntegrationAuth()
  async ingestLeadsWebhook(
    @Request() req: any,
    @Body() body: { category?: string; location?: string; records?: RawGooglePlaceRecord[]; places?: RawGooglePlaceRecord[] } | RawGooglePlaceRecord[],
  ) {
    const companyId = req.user.companyId;
    let records: RawGooglePlaceRecord[] = [];
    let category = 'general';
    let location = 'unspecified';

    if (Array.isArray(body)) {
      records = body;
    } else if (body && typeof body === 'object') {
      records = body.records || body.places || [];
      category = body.category || category;
      location = body.location || location;
    }

    if (!Array.isArray(records) || records.length === 0) {
      throw new BadRequestException('Payload must contain a non-empty array of records or places');
    }

    const result = await this.normalizer.ingestLeads(companyId, records, {
      category,
      location,
      actorId: req.user.actorId,
      automationId: 'automation-1-google-lead-finding',
    });

    return {
      success: true,
      companyId,
      ...result,
    };
  }

  /**
   * Triggers an authorized lead-finding search for the authenticated company.
   */
  @Post('workflows/:id/execute')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async executeWorkflow(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: LeadFindingInput,
  ) {
    const auto = this.registry.getAutomation(id);
    const category = body?.category?.trim();
    const location = body?.location?.trim();

    if (!category || !location) {
      throw new BadRequestException('category and location are required parameters for lead finding');
    }

    // Safety check: confirm execution credentials
    if (!process.env.GOOGLE_PLACES_API_KEY?.trim() && !this.n8nClient.isConfigured()) {
      throw new BadRequestException(
        `Execution blocked: Neither GOOGLE_PLACES_API_KEY nor n8n API connection is configured. Please provide operational credentials before running live discovery.`
      );
    }

    const companyId = req.user.companyId;

    if (this.n8nClient.isConfigured()) {
      const exec = await this.n8nClient.executeWorkflow(auto.id, {
        category,
        location,
        radiusMeters: body.radiusMeters || 50000,
        maxResults: body.maxResults || 20,
        companyId,
      });

      if (!exec.executed) {
        throw new BadRequestException(exec.error || 'Automation execution failed in n8n');
      }

      return {
        status: 'COMPLETED',
        automationId: auto.id,
        companyId,
        parameters: {
          category,
          location,
          radiusMeters: body.radiusMeters || 50000,
          maxResults: body.maxResults || 20,
        },
        result: exec.result,
        message: `Lead finding search executed via Automation #1 for "${category}" in "${location}". Discovered records deduplicated and populated in SalesLead.`,
      };
    }

    return {
      status: 'QUEUED',
      automationId: auto.id,
      companyId,
      parameters: {
        category,
        location,
        radiusMeters: body.radiusMeters || 50000,
        maxResults: body.maxResults || 20,
      },
      message: `Lead finding search queued for "${category}" in "${location}". Discovered records will be deduplicated and populated in SalesLead.`,
    };
  }
}
