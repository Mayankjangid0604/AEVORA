import { Injectable, Logger } from '@nestjs/common';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CeoHiringService } from './ceo-hiring.service';
import { parseJson } from '../common/parse-json';

const SYSTEM = `You are the Head of a department at a small AI-run company, deciding whether to hire one more team member.
Return JSON: { "hire": boolean, "role": string, "responsibilities": string (1 sentence), "reason": string }.
Only hire if your department genuinely needs more hands for its normal work right now. Never hire another Head, Director, Manager-of-managers, or CEO.`;

/** Item 3 (second half): once a department has a Head (hired by the CEO, see CeoReviewService bootstrap), that
 * Head runs its own small hiring cycle for its own team, through the same CeoHiringService the CEO uses — there is
 * no separate per-employee execution loop in this codebase, so this reuses the one real hiring pipeline that exists. */
@Injectable()
export class HeadHiringService {
  private readonly logger = new Logger(HeadHiringService.name);
  private readonly gateway = new ModelGateway();

  constructor(private readonly prisma: PrismaService, private readonly hiring: CeoHiringService) {}

  async runForCompany(companyId: string) {
    const heads = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE', role: { title: { contains: 'Head of' } } },
      select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
    });
    for (const head of heads) await this.runForHead(companyId, head).catch((e) => this.logger.warn(`Head hiring failed for ${head.name}: ${e.message}`));
  }

  private async runForHead(companyId: string, head: { id: string; name: string; departmentId: string; department: { name: string } }) {
    const team = await this.hiring.teamSnapshot(companyId);
    if (!team.canHire) return;
    const deptMembers = await this.prisma.employee.count({ where: { companyId, status: 'ACTIVE', departmentId: head.departmentId } });
    if (deptMembers > 6) return; // cheap ceiling before spending an LLM call on an already-staffed department

    const text = await this.gateway.callWithTier(
      ModelTier.LOCAL_BASIC,
      `You are ${head.name}, Head of ${head.department.name}. Your department currently has ${deptMembers} ${deptMembers === 1 ? 'person' : 'people'} (including you).`,
      SYSTEM,
      { json: true },
    );
    const out = parseJson(text) as { hire?: boolean; role?: string; responsibilities?: string; reason?: string };
    if (!out?.hire || !out.role) return;
    await this.hiring.hire(
      companyId,
      head.id,
      { role: out.role, department: head.department.name, responsibilities: out.responsibilities },
      out.reason ?? `${head.name} is building out the ${head.department.name} team`,
    );
  }
}
