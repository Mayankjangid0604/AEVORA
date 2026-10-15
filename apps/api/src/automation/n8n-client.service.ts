import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AutomationRegistryService } from './automation-registry.service';
import { AutomationDefinition, LeadFindingInput } from './automation.types';

export interface N8nDeployResult {
  deployed: boolean;
  n8nWorkflowId?: string;
  name: string;
  active?: boolean;
  message: string;
}

export interface N8nStatusResult {
  configured: boolean;
  connected: boolean;
  url?: string;
  version?: string;
  error?: string;
}

export interface N8nExecutionResult {
  executed: boolean;
  automationId: string;
  result?: {
    success?: boolean;
    companyId?: string;
    created?: number;
    duplicates?: number;
    count?: number;
    leads?: any[];
    [key: string]: any;
  };
  error?: string;
}

@Injectable()
export class N8nClientService {
  private readonly logger = new Logger(N8nClientService.name);

  constructor(private readonly registry: AutomationRegistryService) {}

  get apiUrl(): string | undefined {
    return process.env.N8N_API_URL?.trim().replace(/\/+$/, '');
  }

  get apiKey(): string | undefined {
    return process.env.N8N_API_KEY?.trim();
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey);
  }

  /**
   * Probes n8n REST API health and returns connection status without throwing.
   */
  async getStatus(): Promise<N8nStatusResult> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        error: 'N8N_API_URL or N8N_API_KEY is not configured',
      };
    }

    try {
      const res = await fetch(`${this.apiUrl}/api/v1/workflows?limit=1`, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': this.apiKey!,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return {
          configured: true,
          connected: false,
          url: this.apiUrl,
          error: `n8n API responded with HTTP status ${res.status}: ${res.statusText}`,
        };
      }

      return {
        configured: true,
        connected: true,
        url: this.apiUrl,
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        url: this.apiUrl,
        error: `Failed to connect to n8n at ${this.apiUrl}: ${err?.message || err}`,
      };
    }
  }

  /**
   * Imports or updates a registered automation workflow into the configured n8n instance.
   * Fails closed if n8n connection is not configured or fails.
   */
  async deployWorkflow(automationId: string, options?: { activate?: boolean }): Promise<N8nDeployResult> {
    const auto = this.registry.getAutomation(automationId);
    if (!this.isConfigured()) {
      throw new BadRequestException(
        `Cannot deploy "${auto.name}": n8n API connection is not configured. Set N8N_API_URL and N8N_API_KEY in environment.`
      );
    }

    const workflowData = this.registry.loadWorkflowJson(auto.id);
    const workflowName = auto.name;

    // Check existing workflows to update rather than duplicating
    let existingId: string | null = null;
    try {
      const searchRes = await fetch(`${this.apiUrl}/api/v1/workflows?limit=100`, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': this.apiKey!,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (searchRes.ok) {
        const body = (await searchRes.json()) as { data?: Array<{ id: string; name: string }> };
        const found = (body.data || []).find((w) => w.name === workflowName || w.id === workflowData.id);
        if (found) {
          existingId = found.id;
        }
      }
    } catch (e: any) {
      this.logger.warn(`Could not query existing workflows in n8n: ${e?.message}`);
    }

    // Deploy or update
    const method = existingId ? 'PUT' : 'POST';
    const endpoint = existingId ? `${this.apiUrl}/api/v1/workflows/${existingId}` : `${this.apiUrl}/api/v1/workflows`;

    const payload = {
      name: workflowName,
      nodes: workflowData.nodes || [],
      connections: workflowData.connections || {},
      settings: workflowData.settings || {},
      staticData: workflowData.staticData || null,
    };

    const res = await fetch(endpoint, {
      method,
      headers: {
        'X-N8N-API-KEY': this.apiKey!,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new BadRequestException(`n8n deployment failed with status ${res.status}: ${errorText}`);
    }

    const deployedWorkflow = (await res.json()) as { id: string; name: string; active?: boolean };
    const n8nId = deployedWorkflow.id;

    let active = deployedWorkflow.active;
    if (options?.activate && !active) {
      try {
        const actRes = await fetch(`${this.apiUrl}/api/v1/workflows/${n8nId}/activate`, {
          method: 'POST',
          headers: { 'X-N8N-API-KEY': this.apiKey! },
          signal: AbortSignal.timeout(10000),
        });
        if (actRes.ok) active = true;
      } catch (actErr: any) {
        this.logger.warn(`Workflow deployed but could not be activated: ${actErr?.message}`);
      }
    }

    this.logger.log(`Successfully deployed Automation #${auto.number} to n8n as workflow ID "${n8nId}"`);

    return {
      deployed: true,
      n8nWorkflowId: n8nId,
      name: workflowName,
      active,
      message: `Workflow successfully deployed to n8n (${existingId ? 'updated existing' : 'created new'}).`,
    };
  }

  /**
   * Executes an automation workflow in the connected n8n engine.
   * For Automation #1, triggers the Google Maps lead finding webhook in n8n.
   */
  async executeWorkflow(
    automationId: string,
    params: LeadFindingInput & { companyId: string },
  ): Promise<N8nExecutionResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('n8n API connection is not configured');
    }

    try {
      const res = await fetch(`${this.apiUrl}/webhook/aevora-leads-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: params.category || 'dentists',
          location: params.location || 'Dallas, TX',
          maxResults: params.maxResults || 20,
          companyId: params.companyId,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          executed: false,
          automationId,
          error: `n8n execution failed with HTTP ${res.status}: ${errText}`,
        };
      }

      const result = await res.json().catch(() => ({}));
      return {
        executed: true,
        automationId,
        result,
      };
    } catch (err: any) {
      this.logger.error(`Error executing workflow ${automationId} in n8n: ${err?.message || err}`);
      return {
        executed: false,
        automationId,
        error: `Failed to trigger n8n workflow: ${err?.message || err}`,
      };
    }
  }
}

