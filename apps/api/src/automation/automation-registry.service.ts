import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  AutomationDefinition,
  AutomationStatus,
} from './automation.types';

@Injectable()
export class AutomationRegistryService {
  private readonly logger = new Logger(AutomationRegistryService.name);
  private readonly workflowCache = new Map<string, any>();

  /**
   * Resolves the absolute path to a workflow JSON file in the repository.
   * Handles running from repository root, apps/api, or build output directories.
   */
  resolveWorkflowPath(relativePath: string): string {
    const candidates = [
      path.resolve(process.cwd(), relativePath),
      path.resolve(process.cwd(), '..', '..', relativePath),
      path.resolve(__dirname, '..', '..', '..', '..', relativePath),
      path.resolve('E:/Aevora', relativePath),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }

  /**
   * Returns metadata and registration definition for Automation #1 (Google Maps Lead Finding).
   */
  getAutomation1Definition(): AutomationDefinition {
    const filePath = this.resolveWorkflowPath('n8n/1.google-lead-finding.json');
    const fileExists = fs.existsSync(filePath);

    const hasGoogleKey = !!process.env.GOOGLE_PLACES_API_KEY?.trim();
    const hasN8nUrl = !!process.env.N8N_API_URL?.trim();
    const hasN8nKey = !!process.env.N8N_API_KEY?.trim();
    const hasIntegrationKey = !!process.env.INTEGRATION_API_KEY?.trim();

    let status: AutomationStatus = 'REGISTERED';
    let nodeCount = 0;
    let triggers: string[] = [];
    let gmapsEndpoint = '';
    const validationErrors: string[] = [];

    if (!fileExists) {
      status = 'ERROR';
      validationErrors.push(`Workflow file not found at ${filePath}`);
    } else {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        nodeCount = Array.isArray(json.nodes) ? json.nodes.length : 0;
        triggers = (json.nodes || [])
          .filter((n: any) => typeof n.type === 'string' && n.type.toLowerCase().includes('trigger'))
          .map((n: any) => n.name);

        const gmapsNode = (json.nodes || []).find((n: any) => n.name === 'GMaps API');
        if (gmapsNode?.parameters?.url) {
          gmapsEndpoint = String(gmapsNode.parameters.url);
        }

        if (hasGoogleKey && hasN8nUrl && hasN8nKey) {
          status = 'CONFIGURED';
        } else if (hasGoogleKey) {
          status = 'REGISTERED';
        }
      } catch (err: any) {
        status = 'ERROR';
        validationErrors.push(`Invalid workflow JSON: ${err?.message || err}`);
      }
    }

    return {
      id: 'automation-1-google-lead-finding',
      number: 1,
      name: 'Generate Leads with Google Maps',
      description: 'Discovers verified commercial business leads using Google Maps / Places API with deduplication and quality scoring.',
      category: 'LEAD_GENERATION',
      version: '1.0.0',
      workflowFile: 'n8n/1.google-lead-finding.json',
      status,
      tags: ['Google Maps', 'Places API', 'Lead Generation', 'Automation #1', 'AlexK1919'],
      requiredCredentials: {
        googlePlacesApi: {
          name: 'Google Places API Key',
          envVar: 'GOOGLE_PLACES_API_KEY',
          description: 'Used for querying places:searchText and business details without client credentials.',
          configured: hasGoogleKey,
        },
        n8nApiConnection: {
          name: 'n8n REST API Connection',
          envVar: 'N8N_API_URL, N8N_API_KEY',
          description: 'Allows AEVORA to deploy, inspect, and trigger workflows inside an n8n instance.',
          configured: hasN8nUrl && hasN8nKey,
        },
        aevoraIntegrationAuth: {
          name: 'AEVORA Service Integration Key',
          envVar: 'INTEGRATION_API_KEY',
          description: 'Allows external n8n workflows to submit ingested leads back into AEVORA securely.',
          configured: hasIntegrationKey,
        },
      },
      inputParameters: {
        category: {
          type: 'string',
          required: true,
          default: 'restaurant',
          description: 'Target business niche or category (e.g. restaurant, gym, hotel, salon, retail_shop, clinic).',
        },
        location: {
          type: 'string',
          required: true,
          default: 'Jaipur, India',
          description: 'Target city, state, or geographic region for search.',
        },
        radiusMeters: {
          type: 'number',
          required: false,
          default: 50000,
          description: 'Search radius from center in meters (up to 50,000 m).',
        },
        maxResults: {
          type: 'number',
          required: false,
          default: 20,
          description: 'Maximum number of candidate records to discover (up to 100).',
        },
        variant: {
          type: 'string',
          required: false,
          description: 'Optional query prefix modifier (e.g. "best", "popular", "top rated").',
        },
      },
      metadata: {
        nodeCount,
        triggers,
        gmapsEndpoint,
        lastValidatedAt: new Date().toISOString(),
        validationErrors: validationErrors.length ? validationErrors : undefined,
      },
    };
  }

  /**
   * Lists all registered automations in AEVORA.
   */
  listAutomations(): AutomationDefinition[] {
    return [this.getAutomation1Definition()];
  }

  /**
   * Retrieves definition for a single automation by ID or number.
   */
  getAutomation(idOrNumber: string | number): AutomationDefinition {
    const list = this.listAutomations();
    const found = list.find(
      (a) => a.id === String(idOrNumber) || String(a.number) === String(idOrNumber)
    );
    if (!found) {
      throw new NotFoundException(`Automation "${idOrNumber}" not found in registry`);
    }
    return found;
  }

  /**
   * Reads and parses the raw n8n workflow JSON definition file.
   */
  loadWorkflowJson(automationId: string): any {
    const auto = this.getAutomation(automationId);
    if (this.workflowCache.has(auto.id)) {
      return this.workflowCache.get(auto.id);
    }

    const filePath = this.resolveWorkflowPath(auto.workflowFile);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Workflow file "${auto.workflowFile}" not found`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    this.workflowCache.set(auto.id, parsed);
    return parsed;
  }
}
