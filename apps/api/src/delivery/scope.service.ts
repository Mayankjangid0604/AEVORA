import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProjectType } from '@prisma/client';
import { ModelGateway, ModelTier, getBudgetTier, getTierConfig } from '@aevora/model-gateway';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ClientNeeds } from '../sales-outreach/discovery.service';
import { companyProfile } from '../config/company';
import { CurrencyService } from '../currency/currency.service';

export interface ProjectScope {
  title: string;
  description: string;
  deliverables: string[];
  estimatedHours: number;
  pricePaise: number;
}

const SCOPE_SYSTEM = `You scope small fixed-price projects for a web/automation agency in India serving local businesses.
Return JSON only: {"title": string, "description": string, "deliverables": string[], "estimatedHours": number, "recommendedPriceInr": number}
Price realistically for small Indian businesses (typically INR 5,000–50,000). Respect the client's budget when given.`;

const MIN_PRICE_PAISE = 1_000_00; // ₹1,000 floor

export function projectTypeFromNeeds(n: Partial<ClientNeeds>): ClientProjectType {
  if (n.needsWebsite) return 'WEBSITE';
  if (n.needsAutomation) return 'AUTOMATION';
  if (n.needsSaaS) return 'SAAS';
  return 'WEBSITE';
}

export function normalizeScope(raw: any, budgetInr: number | null): ProjectScope {
  let priceInr = Math.round(Number(raw?.recommendedPriceInr));
  if (!Number.isFinite(priceInr) || priceInr <= 0) priceInr = Math.round(budgetInr ?? 10_000);
  const hours = Math.round(Number(raw?.estimatedHours));
  return {
    title: String(raw?.title ?? 'Client project').slice(0, 200),
    description: String(raw?.description ?? ''),
    deliverables: Array.isArray(raw?.deliverables) ? raw.deliverables.map(String).slice(0, 20) : [],
    estimatedHours: Number.isFinite(hours) && hours > 0 ? hours : 8,
    pricePaise: Math.max(MIN_PRICE_PAISE, priceInr * 100),
  };
}

/** Markdown brief handed to the Claude Code team for projects above the local-model tier. */
export function buildBrief(p: { id: string; business: string; category: string | null; projectType: string; needs: any }, scope: ProjectScope, tier: ModelTier): string {
  const cfg = getTierConfig(tier);
  return `# Project Brief — ${scope.title}

- Project ID: ${p.id}
- Client: ${p.business}${p.category ? ` (${p.category})` : ''}
- Type: ${p.projectType}
- Quoted: Rs${(scope.pricePaise / 100).toLocaleString('en-IN')}
- Model tier: ${tier} (${cfg.model}) — ${cfg.useCase}
- Estimated hours: ${scope.estimatedHours}

## Description
${scope.description}

## Deliverables
${scope.deliverables.map((d) => `- ${d}`).join('\n') ||'- (none listed)'}

## Client requirements
\`\`\`json
${JSON.stringify(p.needs ?? {}, null, 2)}
\`\`\`

## Rules
- Stack: React / Next.js, Node.js, Tailwind CSS. Deploy to Vercel.
- Client-facing text signs as: Team ${companyProfile().name} | ${companyProfile().email} | ${companyProfile().phone}
- Never use personal names in client-facing copy.
- When done, move this file to briefs/completed/.
`;
}

@Injectable()
export class ScopeService {
  private readonly gateway = new ModelGateway();
  private readonly logger = new Logger(ScopeService.name);

  constructor(private readonly prisma: PrismaService, private readonly currency: CurrencyService) {}

  async scopeProject(companyId: string, projectId: string) {
    const project = await this.prisma.clientProject.findFirst({ where: { id: projectId, companyId }, include: { lead: true } });
    if (!project) throw new NotFoundException('Client project not found');
    const needs = project.requirements as any;

    const res = await this.gateway.generate({
      systemMessage: SCOPE_SYSTEM,
      prompt: JSON.stringify({
        business: project.lead.name,
        category: project.lead.industry,
        projectType: project.projectType,
        needs,
      }),
      requireStructuredOutput: true,
      temperature: 0.2,
    });
    const scope = normalizeScope(res.structuredOutput, needs?.budget ?? null);
    const tier = getBudgetTier(scope.pricePaise);

    if (tier !== ModelTier.LOCAL_BASIC) {
      // Same root resolution as main.ts: the API runs from apps/api.
      const dir = path.resolve(process.cwd(), '../..', process.env.BRIEF_OUTPUT_DIR || 'briefs/pending');
      try {
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${project.id}.md`);
        fs.writeFileSync(file, buildBrief({ id: project.id, business: project.lead.name, category: project.lead.industry, projectType: project.projectType, needs }, scope, tier));
        this.logger.log(`[${companyId}] ${tier} brief written: ${file}`);
      } catch (e) {
        this.logger.error(`[${companyId}] brief write failed for ${project.id}: ${e.message}`);
      }
    }

    return this.prisma.clientProject.update({
      where: { id: project.id },
      // Item 26: keep the INR price and add the client's currency (converted with the Chairman's rate, stored with the rate used).
      data: { scope: { ...scope, modelTier: tier } as any, quotedAmount: scope.pricePaise, ...(await this.currency.quoteFields(companyId, project.lead.geography, scope.pricePaise)), status: 'BUILDING' },
    });
  }
}
