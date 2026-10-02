import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementDecisionService } from '../company-operations/management-decision.service';
import { parseJson } from '../common/parse-json';
import { CODE_CHANGE_PATH_OK } from '../common/code-change';

const SYSTEM = `You are an AI employee at an AI-run software company, currently idle. Your default idle task is to improve the
company's own product codebase (a Next.js + NestJS + Three.js monorepo). Pick ONE small, concrete, safe improvement in your area
(AI model routing/gateway, 3D office avatar movement, or the 2D/3D company simulation features) and return JSON:
{ "summary": string (one line, for a commit message), "files": [ { "path": string (repo-relative, must start with "apps/" or "packages/"), "content": string (the FULL new file content) } ] }
Touch at most 2 files. Never touch .env, secrets, lockfiles, node_modules, .git, or CI/workflow files. If nothing safe comes to mind, return { "summary": "", "files": [] }.`;

/** Item 5: idle employees' default behavior is to work on the company's own codebase (F:\Aevora-Saahvik) — but they only
 * ever PROPOSE the change. Nothing touches disk or git here: a CODE_CHANGE ManagementDecision goes into the Chairman's
 * existing approval queue (GET/POST /chairman/decisions), and the actual file write + local git commit only happens
 * if and when the Chairman approves it (see ManagementDecisionService.executeCodeChange). Off by default — opt in via
 * the existing ProductionCapability flag "IDLE_CODEGEN". */
@Injectable()
export class IdleCodegenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdleCodegenService.name);
  private readonly gateway = new ModelGateway();
  private tickInterval: NodeJS.Timeout | null = null;
  private readonly lastRunByEmployee = new Map<string, number>();
  private busy = false;

  constructor(private readonly prisma: PrismaService, private readonly decisions: ManagementDecisionService) {}

  onModuleInit() {
    // ponytail: a slow, coarse poll — this is background filler work, not latency-sensitive.
    this.tickInterval = setInterval(() => this.tick().catch((e) => this.logger.warn(e.message)), 5 * 60_000).unref();
  }

  onModuleDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const companies = await this.prisma.productionCapability.findMany({
        where: { capability: 'IDLE_CODEGEN', environment: 'PRODUCTION', isEnabled: true },
        select: { companyId: true },
      });
      for (const { companyId } of companies) await this.proposeForOneIdleEmployee(companyId);
    } finally {
      this.busy = false;
    }
  }

  private async proposeForOneIdleEmployee(companyId: string) {
    const cooldownMs = Number(process.env.AGENT_CODEGEN_COOLDOWN_MIN ?? 30) * 60_000;
    const now = Date.now();
    const idle = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE', activity: 'IDLE' },
      select: { id: true, name: true, role: { select: { title: true } } },
      take: 20,
    });
    const candidate = idle.find((e) => now - (this.lastRunByEmployee.get(e.id) ?? 0) > cooldownMs);
    if (!candidate) return;
    this.lastRunByEmployee.set(candidate.id, now);

    try {
      const text = await this.gateway.callWithTier(
        ModelTier.LOCAL_BASIC,
        `You are ${candidate.name}, ${candidate.role?.title ?? 'an employee'}, currently idle.`,
        SYSTEM,
        { json: true },
      );
      const out = parseJson(text) as { summary?: string; files?: { path: string; content: string }[] };
      const files = (Array.isArray(out?.files) ? out.files : []).filter((f) => CODE_CHANGE_PATH_OK(f?.path) && typeof f?.content === 'string').slice(0, 2);
      if (!out?.summary || files.length === 0) return;

      await this.decisions.proposeDecision(
        companyId,
        candidate.id,
        'WORKLOAD_REBALANCING' as any,
        `Code change: ${out.summary}`.slice(0, 200),
        `Proposed by ${candidate.name} while idle. Touches: ${files.map((f) => f.path).join(', ')}`,
        undefined,
        { summary: out.summary, files },
      );
      this.logger.log(`${candidate.name} proposed a code change for Chairman approval: ${out.summary}`);
    } catch (e: any) {
      this.logger.warn(`Idle codegen proposal failed for ${candidate.name}: ${e.message}`);
    }
  }
}
