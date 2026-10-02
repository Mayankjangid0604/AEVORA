import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { NewVentureService } from '../ventures/new-venture.service';
import { parseJson } from '../common/parse-json';
import { companyLine, companyProfile } from '../config/company';

export type IdeaRecommendation = 'APPROVE' | 'REJECT' | 'NEED_INFO';

export interface IdeaEvaluation {
  score: number; // 1-10
  recommendation: IdeaRecommendation;
  evaluationText: string;
  targetMarket: string | null;
  estimatedBudget: number | null; // paise
  question: string | null;
  rejectionReason: string | null;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_INT = 2_147_483_647;

/**
 * Model output → a safe evaluation. The score decides approve/reject (7+ / 1-4) so a garbled
 * recommendation can never auto-create a venture; NEED_INFO is honoured whenever the model asks.
 */
export function normalizeEvaluation(raw: any): IdeaEvaluation {
  const n = Math.round(Number(raw?.score));
  const score = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
  const question = typeof raw?.question === 'string' && raw.question.trim() ? raw.question.trim() : null;
  let recommendation: IdeaRecommendation = score >= 7 ? 'APPROVE' : score <= 4 ? 'REJECT' : 'NEED_INFO';
  if (raw?.recommendation === 'NEED_INFO') recommendation = 'NEED_INFO';

  const list = (v: any) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 5) : []);
  const strengths = list(raw?.strengths);
  const risks = list(raw?.risks);
  const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
  const budget = Math.round(Number(raw?.estimatedBudget));

  return {
    score,
    recommendation,
    evaluationText: [summary, strengths.length ? `Strengths: ${strengths.join(', ')}` : '', risks.length ? `Risks: ${risks.join(', ')}` : '']
      .filter(Boolean)
      .join('\n') || 'No analysis returned.',
    targetMarket: typeof raw?.targetMarket === 'string' && raw.targetMarket.trim() ? raw.targetMarket.trim() : null,
    estimatedBudget: Number.isFinite(budget) && budget > 0 ? Math.min(budget, MAX_INT) : null,
    question: recommendation === 'NEED_INFO' ? question ?? 'What budget and first customers do you have in mind for this?' : null,
    rejectionReason:
      recommendation === 'REJECT'
        ? (typeof raw?.rejectionReason === 'string' && raw.rejectionReason.trim()) || `Scored ${score}/10 by the CEO`
        : null,
  };
}

const evaluationPrompt = (title: string, description: string, balanceRs: number, employees: number) => `You are ARIA, CEO of ${companyLine()}.
A startup idea has been submitted. Evaluate it as a CEO would.

COMPANY CONTEXT:
- Current balance: Rs${balanceRs}
- Active employees: ${employees}
- Headquarters: ${companyProfile().address || 'India'} — clients anywhere in India and abroad (remote delivery)
- Expertise: websites, SaaS, automation, digital solutions

IDEA TO EVALUATE:
Title: ${title}
Description: ${description}

Evaluate this idea for the national (India) and international market.
Consider: feasibility, market size, competition, revenue potential,
required investment, and whether ${companyProfile().name} can execute it.

Return ONLY this JSON (no explanation):
{
  "score": <1-10>,
  "summary": "2-3 sentence analysis",
  "strengths": ["strength 1", "strength 2"],
  "risks": ["risk 1", "risk 2"],
  "recommendation": "APPROVE | REJECT | NEED_INFO",
  "targetMarket": "who are the customers",
  "estimatedBudget": <startup cost in paise, integer>,
  "question": null,
  "rejectionReason": null
}

recommendation must be APPROVE (score 7+), REJECT (score 1-4),
or NEED_INFO (score 5-6 or missing key information).
estimatedBudget is in paise (Rs1000 = 100000 paise).
If recommendation is NEED_INFO, set question to a single clarifying question.
If recommendation is REJECT, set rejectionReason.`;

const generationPrompt = (balanceRs: number, industries: string) => `You are ARIA, CEO of ${companyLine()}.
Based on your company's performance, generate ONE promising startup idea.

COMPANY CONTEXT:
- Balance: Rs${balanceRs}
- Recent converted clients from: ${industries || 'various industries'}
- Headquarters: ${companyProfile().address || 'India'} — target clients across India and internationally
- Expertise: websites, SaaS, automation

Think about:
- What digital products do small and mid-size businesses in India and abroad need?
- What services are underserved that a remote team can deliver?
- What can ${companyProfile().name} build with current team?

Return ONLY this JSON:
{
  "title": "Short idea name",
  "description": "2-3 sentence description of the idea and why it can win clients in India and internationally",
  "problem": "What problem does it solve",
  "targetMarket": "Who are the customers"
}`;

@Injectable()
export class IdeasService {
  private readonly logger = new Logger(IdeasService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ventures: NewVentureService,
  ) {}

  /** Stores the idea and evaluates it in the background (phi4 takes ~1 min on CPU). */
  async submitIdea(companyId: string, title: string, description: string, source: 'CHAIRMAN' | 'CEO_GENERATED' = 'CHAIRMAN', extra: { problem?: string; targetMarket?: string } = {}) {
    this.logger.log(`New idea submitted: "${title}" from ${source}`);
    const idea = await this.prisma.startupIdea.create({
      data: { companyId, source, title: title.slice(0, 200), description, status: 'EVALUATING', problem: extra.problem ?? null, targetMarket: extra.targetMarket ?? null },
    });
    this.evaluateIdea(companyId, idea.id).catch((e) => this.logger.error(`Evaluation failed for ${idea.id}: ${e.message}`));
    return idea;
  }

  async evaluateIdea(companyId: string, ideaId: string): Promise<void> {
    const idea = await this.prisma.startupIdea.findFirst({ where: { id: ideaId, companyId } });
    if (!idea || idea.status !== 'EVALUATING') return;

    const [account, employees] = await Promise.all([
      this.prisma.realMoneyAccount.findUnique({ where: { companyId } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
    ]);

    let evaluation: IdeaEvaluation;
    try {
      const raw = await this.gateway.callWithTier(
        ModelTier.LOCAL_BASIC,
        evaluationPrompt(idea.title, idea.description, Math.round((account?.balance ?? 0) / 100), employees),
        undefined,
        { json: true },
      );
      const parsed = parseJson(raw);
      if (!parsed) throw new Error('No JSON in model response');
      evaluation = normalizeEvaluation(parsed);
    } catch (e) {
      this.logger.error(`[${companyId}] idea ${ideaId} evaluation error: ${e.message}`);
      await this.prisma.startupIdea.update({ where: { id: ideaId }, data: { status: 'PENDING', ceoEvaluation: `Evaluation failed: ${e.message}` } });
      return;
    }

    await this.prisma.startupIdea.update({
      where: { id: ideaId },
      data: {
        ceoScore: evaluation.score,
        ceoEvaluation: evaluation.evaluationText,
        targetMarket: evaluation.targetMarket ?? idea.targetMarket,
        estimatedBudget: evaluation.estimatedBudget,
        ceoQuestion: evaluation.question,
        rejectionReason: evaluation.rejectionReason,
        // NEED_INFO → back to PENDING with a question for the Chairman
        status: evaluation.recommendation === 'APPROVE' ? 'APPROVED' : evaluation.recommendation === 'REJECT' ? 'REJECTED' : 'PENDING',
      },
    });
    this.logger.log(`Idea "${idea.title}" evaluated: ${evaluation.recommendation} (score ${evaluation.score})`);

    if (evaluation.recommendation === 'APPROVE') await this.createVentureFromIdea(companyId, ideaId);
  }

  async answerQuestion(companyId: string, ideaId: string, answer: string) {
    const idea = await this.findOrThrow(companyId, ideaId);
    if (idea.status !== 'PENDING' || !idea.ceoQuestion) throw new BadRequestException('This idea has no open CEO question');
    await this.prisma.startupIdea.update({
      where: { id: ideaId },
      data: {
        chairmanReply: answer,
        status: 'EVALUATING',
        description: `${idea.description}\n\nQ: ${idea.ceoQuestion}\nA: ${answer}`,
        ceoQuestion: null,
      },
    });
    this.evaluateIdea(companyId, ideaId).catch((e) => this.logger.error(`Re-evaluation failed for ${ideaId}: ${e.message}`));
    return { message: 'Answer received. CEO is re-evaluating.' };
  }

  /** Chairman override: approve and form the venture now (waits for the team to form). */
  async approveIdea(companyId: string, ideaId: string) {
    const idea = await this.findOrThrow(companyId, ideaId);
    if (idea.status === 'VENTURE_CREATED') return this.getIdea(companyId, ideaId);
    if (idea.status === 'EVALUATING') throw new BadRequestException('CEO is still evaluating this idea');
    await this.prisma.startupIdea.update({ where: { id: ideaId }, data: { status: 'APPROVED', ceoQuestion: null, rejectionReason: null } });
    await this.createVentureFromIdea(companyId, ideaId);
    return this.getIdea(companyId, ideaId);
  }

  async rejectIdea(companyId: string, ideaId: string, reason: string) {
    const idea = await this.findOrThrow(companyId, ideaId);
    if (idea.status === 'VENTURE_CREATED') throw new BadRequestException('A venture already exists for this idea — pause or close it in Ventures');
    return this.prisma.startupIdea.update({ where: { id: ideaId }, data: { status: 'REJECTED', rejectionReason: reason.slice(0, 1000), ceoQuestion: null } });
  }

  /** spawnTeam is idempotent on the idea id, so a retry or a double approve never forms two teams. */
  private async createVentureFromIdea(companyId: string, ideaId: string): Promise<void> {
    const idea = await this.prisma.startupIdea.findFirst({ where: { id: ideaId, companyId } });
    if (!idea) return;
    try {
      const venture = await this.ventures.spawnTeam(`${idea.title}: ${idea.description}`, companyId, { idempotencyKey: `idea-${ideaId}` });
      // Drop the note left by an earlier failed attempt.
      const evaluation = (idea.ceoEvaluation ?? '').split('\n').filter((l) => !l.startsWith('Venture creation failed:')).join('\n') || null;
      await this.prisma.startupIdea.update({ where: { id: ideaId }, data: { status: 'VENTURE_CREATED', ventureId: venture.id, ceoEvaluation: evaluation } });
      this.logger.log(`Venture created for idea: ${idea.title}`);
    } catch (e) {
      // Stays APPROVED so the Chairman can retry with Approve.
      this.logger.error(`Venture creation failed for idea ${ideaId}: ${e.message}`);
      await this.prisma.startupIdea.update({
        where: { id: ideaId },
        data: { ceoEvaluation: `${idea.ceoEvaluation ?? ''}\nVenture creation failed: ${e.message}`.trim() },
      });
    }
  }

  /** At most one CEO-generated idea per 7 days — checked before spending a model call. */
  async generateCeoIdea(companyId: string) {
    const recent = await this.prisma.startupIdea.findFirst({
      where: { companyId, source: 'CEO_GENERATED', createdAt: { gte: new Date(Date.now() - WEEK) } },
    });
    if (recent) {
      this.logger.debug('CEO already generated an idea this week, skipping');
      return null;
    }

    const [account, converted] = await Promise.all([
      this.prisma.realMoneyAccount.findUnique({ where: { companyId } }),
      this.prisma.salesLead.findMany({ where: { companyId, status: 'CONVERTED' }, orderBy: { createdAt: 'desc' }, take: 5, select: { industry: true } }),
    ]);
    const industries = [...new Set(converted.map((l) => l.industry).filter(Boolean))].join(', ');

    try {
      const raw = await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, generationPrompt(Math.round((account?.balance ?? 0) / 100), industries), undefined, { json: true });
      const g = parseJson(raw);
      const title = typeof g?.title === 'string' ? g.title.trim() : '';
      const description = typeof g?.description === 'string' ? g.description.trim() : '';
      if (!title || !description) throw new Error('model returned no title/description');
      const idea = await this.submitIdea(companyId, title, description, 'CEO_GENERATED', {
        problem: typeof g.problem === 'string' ? g.problem : undefined,
        targetMarket: typeof g.targetMarket === 'string' ? g.targetMarket : undefined,
      });
      this.logger.log(`CEO self-generated idea: ${title}`);
      return idea;
    } catch (e) {
      this.logger.error(`[${companyId}] CEO idea generation failed: ${e.message}`);
      return null;
    }
  }

  getIdeas(companyId: string) {
    return this.prisma.startupIdea.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, include: { venture: true } });
  }

  async getIdea(companyId: string, ideaId: string) {
    const idea = await this.prisma.startupIdea.findFirst({ where: { id: ideaId, companyId }, include: { venture: true } });
    if (!idea) throw new NotFoundException('Idea not found');
    return idea;
  }

  private async findOrThrow(companyId: string, ideaId: string) {
    const idea = await this.prisma.startupIdea.findFirst({ where: { id: ideaId, companyId } });
    if (!idea) throw new NotFoundException('Idea not found');
    return idea;
  }
}
