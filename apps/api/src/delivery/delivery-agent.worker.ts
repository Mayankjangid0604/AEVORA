import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { emailSignature, isKilled, outreachEnv } from '../sales-outreach/email-outreach.service';
import { ScopeService, projectTypeFromNeeds } from './scope.service';
import { quoteLabel } from '../currency/currency.logic';

const BUILD_SYSTEM: Record<string, string> = {
  WEBSITE: 'You are a web designer. Produce a complete, mobile-friendly single-page HTML website (inline CSS, no JavaScript, no external scripts) for the business described. Return ONLY the HTML document.',
  AUTOMATION: 'You are a solutions architect. Produce a clear automation specification as a standalone HTML document (inline CSS, no JavaScript): goals, triggers, workflows, tools, and rollout plan. Return ONLY the HTML document.',
  SAAS: 'You are a product manager. Produce a SaaS feature breakdown as a standalone HTML document (inline CSS, no JavaScript): user roles, features, MVP scope, and milestones. Return ONLY the HTML document.',
  APP: 'You are a product manager. Produce a mobile app feature breakdown as a standalone HTML document (inline CSS, no JavaScript): screens, features, MVP scope, and milestones. Return ONLY the HTML document.',
};

/** Pull the HTML document out of a model reply (strips markdown fences / chatter). */
export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!doctype html|<html/i);
  return start >= 0 ? body.slice(start) : `<!doctype html><html><body>${body}</body></html>`;
}

export function sampleUrl(projectId: string) {
  const base = process.env.PUBLIC_API_URL ?? 'http://localhost:13000';
  return `${base}/delivery/samples/${projectId}`;
}

@Injectable()
export class DeliveryAgentWorker {
  private readonly logger = new Logger(DeliveryAgentWorker.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly integration: IntegrationService,
  ) {}

  async processQueue(companyId: string) {
    if (await isKilled(this.prisma, companyId, ['GLOBAL_PRODUCTION', 'DELIVERY'])) return { skipped: 'kill_switch' };
    const created = await this.intakeDiscoveryCalls(companyId);

    const projects = await this.prisma.clientProject.findMany({
      where: { companyId, status: { in: ['SCOPING', 'BUILDING', 'REVISION'] } },
      orderBy: { updatedAt: 'asc' },
      take: 3, // LLM-heavy; keep batches small
    });
    for (const p of projects) {
      try {
        if (p.status === 'SCOPING') await this.scope.scopeProject(companyId, p.id);
        else await this.buildAndSend(companyId, p.id);
      } catch (e) {
        this.logger.error(`Project ${p.id} (${p.status}) failed: ${e.message}`);
        await this.prisma.clientProject.update({ where: { id: p.id }, data: { error: String(e.message).slice(0, 1000) } });
      }
    }
    return { created, processed: projects.length };
  }

  /** Completed discovery calls without a project → new ClientProject in SCOPING. */
  private async intakeDiscoveryCalls(companyId: string) {
    const calls = await this.prisma.discoveryCall.findMany({
      where: { companyId, status: 'COMPLETED', extractedNeeds: { not: Prisma.DbNull } },
      take: 20,
    });
    let created = 0;
    for (const call of calls) {
      const needs = call.extractedNeeds as any;
      try {
        await this.prisma.clientProject.create({
          data: {
            companyId,
            leadId: call.leadId,
            discoveryCallId: call.id,
            projectType: projectTypeFromNeeds(needs),
            requirements: needs,
            idempotencyKey: `client-project:${call.id}`,
          },
        });
        created++;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    return created;
  }

  async buildAndSend(companyId: string, projectId: string) {
    const p = await this.prisma.clientProject.findFirst({ where: { id: projectId, companyId }, include: { lead: true } });
    if (!p) throw new NotFoundException('Client project not found');

    const res = await this.gateway.generate({
      systemMessage: BUILD_SYSTEM[p.projectType],
      prompt: JSON.stringify({
        business: p.lead.name,
        category: p.lead.industry,
        location: p.lead.geography,
        phone: p.lead.contactPhone,
        scope: p.scope,
        requirements: p.requirements,
      }),
      complexity: 'COMPLEX',
      maxTokens: 6000,
    });
    const html = extractHtml(res.text);
    const url = sampleUrl(p.id);

    await this.prisma.clientProject.update({
      where: { id: p.id },
      data: { sampleHtml: html, sampleUrl: url, status: 'SAMPLE_SENT', error: null },
    });

    if (p.lead.contactEmail) {
      const scope = p.scope as any;
      await this.integration.sendEmail(companyId, outreachEnv(), {
        to: p.lead.contactEmail,
        subject: `${p.revisionCount ? 'Updated sample' : 'Your free sample'} for ${p.lead.name}`,
        body: `Hello ${p.lead.name} team,

As promised, here is a sample of ${scope?.title ?? 'your project'}:
${url}

Quoted price: ${quoteLabel(p)}

Reply with any changes you would like, or "approved" to go ahead.

${emailSignature()}`,
      });
    }
  }

  /** RevisionService: client feedback → append to requirements, rebuild on next cycle. */
  async requestRevision(companyId: string, projectId: string, feedback: string) {
    if (!feedback?.trim()) throw new BadRequestException('feedback is required');
    const p = await this.prisma.clientProject.findFirst({ where: { id: projectId, companyId } });
    if (!p) throw new NotFoundException('Client project not found');
    if (p.status !== 'SAMPLE_SENT') throw new BadRequestException(`Cannot revise a project in ${p.status}`);
    const req = (p.requirements ?? {}) as any;
    return this.prisma.clientProject.update({
      where: { id: p.id },
      data: {
        status: 'REVISION',
        revisionCount: { increment: 1 },
        requirements: { ...req, revisions: [...(req.revisions ?? []), { feedback, at: new Date().toISOString() }] },
      },
    });
  }
}
