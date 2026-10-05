import { Injectable, Logger } from '@nestjs/common';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { parseJson } from '../common/parse-json';
import { DEMO_CONTENT_PROMPT, demoProjectName, nextDemoFiles, normalizeDemoContent, realProfile } from './demo-site/next-template';

const DAY = 86_400_000;
const VERCEL = 'https://api.vercel.com';

/** Lead fields the demo needs. */
export interface DemoLead { id: string; companyId: string; name: string; industry?: string | null; geography?: string | null; contactPhone?: string | null; notes?: string | null; website?: string | null }

/** "12 MI Road, Jaipur, India" → "Jaipur, India" (last two parts); falls back to the whole string. */
export function cityOf(geography?: string | null) {
  const parts = (geography ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(', ') : parts[0] ?? '';
}

/**
 * Pick the public URL of a deployment: only `<project>.vercel.app` — never the per-deployment URL, which carries
 * the Vercel account/team name (e.g. demo-x-9f3k-mayank-jangids-projects.vercel.app).
 */
export function cleanDemoUrl(projectName: string, aliases: string[] = []): string | null {
  const want = `${projectName}.vercel.app`;
  return aliases.includes(want) ? `https://${want}` : null;
}

@Injectable()
export class DemoFactoryService {
  private readonly logger = new Logger(DemoFactoryService.name);
  private modelGateway = new ModelGateway();

  constructor(private readonly prisma: PrismaService) {}

  private get token() { return process.env.VERCEL_API_TOKEN?.trim() || ''; }
  private teamQs(sep = '?') { return process.env.VERCEL_TEAM_ID ? `${sep}teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : ''; }
  private headers() { return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }; }

  /**
   * Build a Next.js demo for the lead, deploy it to Vercel and return ONLY the clean link, or null.
   * Reuses a live demo for the same lead. Without VERCEL_API_TOKEN nothing is built.
   */
  async createDemoForLead(lead: DemoLead): Promise<string | null> {
    if (!this.token) {
      this.logger.warn('VERCEL_API_TOKEN missing — no demo site (email goes without a demo link)');
      return null;
    }
    const existing = await this.prisma.demoSite.findFirst({ where: { leadId: lead.id, status: 'LIVE' } });
    if (existing?.url) return existing.url;

    const city = cityOf(lead.geography);
    const profile = realProfile(lead);
    let raw: any = null;
    try {
      const res = await this.modelGateway.generate({ prompt: DEMO_CONTENT_PROMPT({ name: lead.name, industry: lead.industry, city, kind: profile.kind }) });
      raw = parseJson(res.text ?? '');
    } catch (e) {
      this.logger.warn(`Demo content generation failed, using defaults: ${e.message}`);
    }
    const content = normalizeDemoContent(raw, { name: lead.name, industry: lead.industry, city: city || 'your city', phone: lead.contactPhone, address: profile.address, hours: profile.hours });
    const projectName = demoProjectName(lead.name);
    const site = await this.prisma.demoSite.create({ data: { companyId: lead.companyId, leadId: lead.id, projectName } });

    try {
      // 1. Project first, so public access can be set before anything is deployed.
      const pRes = await fetch(`${VERCEL}/v10/projects${this.teamQs()}`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ name: projectName, framework: 'nextjs' }) });
      if (!pRes.ok) throw new Error(`create project ${pRes.status}: ${(await pRes.text()).slice(0, 300)}`);
      const project = (await pRes.json()) as any;
      await fetch(`${VERCEL}/v9/projects/${project.id}${this.teamQs()}`, { method: 'PATCH', headers: this.headers(), body: JSON.stringify({ ssoProtection: null, passwordProtection: null }) }).catch(() => null);
      await this.prisma.demoSite.update({ where: { id: site.id }, data: { vercelProjectId: project.id } });

      // 2. Production deployment of the Next.js files (Vercel installs and builds).
      const dRes = await fetch(`${VERCEL}/v13/deployments${this.teamQs()}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ name: projectName, project: project.id, target: 'production', files: nextDemoFiles(content), projectSettings: { framework: 'nextjs' } }),
      });
      if (!dRes.ok) throw new Error(`deploy ${dRes.status}: ${(await dRes.text()).slice(0, 300)}`);
      const dep = (await dRes.json()) as any;

      // 3. Wait for the build (up to ~4 min) and take the clean production alias.
      const url = await this.waitForAlias(dep.id, projectName);
      if (!url) throw new Error('deployment did not become ready with a clean <project>.vercel.app alias');
      await this.prisma.demoSite.update({ where: { id: site.id }, data: { status: 'LIVE', url } });
      this.logger.log(`Demo for ${lead.name} live: ${url}`);
      return url;
    } catch (e) {
      this.logger.error(`Demo for ${lead.name} failed: ${e.message}`);
      await this.prisma.demoSite.update({ where: { id: site.id }, data: { status: 'FAILED', error: String(e.message).slice(0, 500) } });
      await this.deleteProject(site.id).catch(() => null); // never leave a half-built project behind
      return null;
    }
  }

  private async waitForAlias(deploymentId: string, projectName: string, timeoutMs = 240_000): Promise<string | null> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 6000));
      const r = await fetch(`${VERCEL}/v13/deployments/${deploymentId}${this.teamQs()}`, { headers: this.headers() });
      if (!r.ok) continue;
      const d = (await r.json()) as any;
      if (d.readyState === 'ERROR' || d.readyState === 'CANCELED') throw new Error(`build ${d.readyState}`);
      if (d.readyState === 'READY') {
        const url = cleanDemoUrl(projectName, d.alias ?? []);
        if (url) return url;
      }
    }
    return null;
  }

  /** Delete the Vercel project of a demo and mark it DELETED. */
  async deleteProject(demoSiteId: string) {
    const site = await this.prisma.demoSite.findUnique({ where: { id: demoSiteId } });
    if (!site || site.status === 'DELETED') return false;
    if (site.vercelProjectId && this.token) {
      const r = await fetch(`${VERCEL}/v9/projects/${site.vercelProjectId}${this.teamQs()}`, { method: 'DELETE', headers: this.headers() });
      if (!r.ok && r.status !== 404) throw new Error(`delete project ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    await this.prisma.demoSite.update({ where: { id: site.id }, data: { status: 'DELETED', deletedAt: new Date() } });
    return true;
  }

  /**
   * Business-loop step: demos older than DEMO_TTL_DAYS (7) whose lead never replied are deleted from Vercel.
   * A reply = any inbound message from the lead after the demo was made, or the lead moved to QUALIFIED/CONVERTED.
   */
  async cleanupUnanswered(companyId: string) {
    const days = Number(process.env.DEMO_TTL_DAYS ?? 7);
    const old = await this.prisma.demoSite.findMany({
      where: { companyId, status: { in: ['LIVE', 'FAILED', 'BUILDING'] }, createdAt: { lt: new Date(Date.now() - days * DAY) } },
      take: 50,
    });
    let deleted = 0;
    for (const s of old) {
      const [replies, lead] = await Promise.all([
        this.prisma.inboundMessage.count({ where: { companyId, leadId: s.leadId, createdAt: { gte: s.createdAt } } }),
        this.prisma.salesLead.findUnique({ where: { id: s.leadId }, select: { status: true } }),
      ]);
      if (replies > 0 || lead?.status === 'QUALIFIED' || lead?.status === 'CONVERTED') continue;
      try {
        if (await this.deleteProject(s.id)) deleted++;
      } catch (e) {
        this.logger.warn(`[${companyId}] could not delete demo ${s.projectName}: ${e.message}`);
      }
    }
    return { checked: old.length, deleted };
  }
}
