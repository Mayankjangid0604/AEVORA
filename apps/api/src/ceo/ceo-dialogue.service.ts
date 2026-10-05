import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CeoQuestionUrgency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';

const MAX_OPEN = 3; // the CEO shouldn't pester: at most 3 unanswered questions at a time
const EXPIRE_DAYS = 7;

export function parseUrgency(v: unknown): CeoQuestionUrgency {
  return v === 'LOW' || v === 'HIGH' ? v : 'MEDIUM';
}

/** CEO → Chairman questions (ESCALATE_TO_CHAIRMAN) and the Chairman's answers flowing back into the next review. */
@Injectable()
export class CeoDialogueService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  async ask(companyId: string, question: string, context: Record<string, any>, urgency: CeoQuestionUrgency, ceoReviewId?: string) {
    const text = question.trim().slice(0, 600);
    if (!text) throw new BadRequestException('empty question');
    const open = await this.prisma.ceoQuestion.findMany({ where: { companyId, status: 'OPEN' }, select: { question: true } });
    if (open.some((q) => q.question === text)) return { skipped: 'already asked' as const };
    if (open.length >= MAX_OPEN) return { skipped: `already ${open.length} unanswered questions` as const };

    const q = await this.prisma.ceoQuestion.create({ data: { companyId, question: text, context, urgency, ceoReviewId } });
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    this.realtime.broadcastToUser(company.chairmanId, 'ceo.question', { id: q.id, question: q.question, context: q.context, urgency: q.urgency, askedAt: q.askedAt });
    return { question: q };
  }

  list(companyId: string, status?: 'OPEN' | 'ANSWERED' | 'USED' | 'EXPIRED') {
    return this.prisma.ceoQuestion.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: [{ status: 'asc' }, { askedAt: 'desc' }],
      take: 50,
    });
  }

  async answer(companyId: string, id: string, answer: string) {
    const text = answer?.trim();
    if (!text) throw new BadRequestException('answer is required');
    if (text.length > 2000) throw new BadRequestException('answer too long (max 2000 characters)');
    const res = await this.prisma.ceoQuestion.updateMany({
      where: { id, companyId, status: 'OPEN' },
      data: { chairmanAnswer: text, answeredAt: new Date(), status: 'ANSWERED' },
    });
    if (!res.count) {
      const q = await this.prisma.ceoQuestion.findFirst({ where: { id, companyId } });
      if (!q) throw new NotFoundException('Question not found');
      throw new BadRequestException(`Question is already ${q.status.toLowerCase()}`);
    }
    return this.prisma.ceoQuestion.findUniqueOrThrow({ where: { id } });
  }

  /** For the next review: answered-but-unread questions. Also expires questions left unanswered for a week. */
  async pendingAnswers(companyId: string) {
    await this.prisma.ceoQuestion.updateMany({
      where: { companyId, status: 'OPEN', askedAt: { lt: new Date(Date.now() - EXPIRE_DAYS * 86_400_000) } },
      data: { status: 'EXPIRED' },
    });
    return this.prisma.ceoQuestion.findMany({ where: { companyId, status: 'ANSWERED' }, orderBy: { answeredAt: 'asc' }, take: 10 });
  }

  markUsed(ids: string[]) {
    if (!ids.length) return Promise.resolve({ count: 0 });
    return this.prisma.ceoQuestion.updateMany({ where: { id: { in: ids }, status: 'ANSWERED' }, data: { status: 'USED', usedAt: new Date() } });
  }
}
