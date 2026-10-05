import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bridge between KnowledgeRecord (structured knowledge base) and OrganizationalMemory
 * (append-only decision/lesson log). Provides unified context retrieval for AI agents.
 */
@Injectable()
export class MemoryIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unified company context: merges knowledge + org memory + recent decisions for agent consumption. */
  async getCompanyContext(companyId: string, opts?: { limit?: number; tags?: string[] }) {
    const limit = opts?.limit ?? 20;

    const [knowledge, memories, decisions] = await Promise.all([
      this.prisma.knowledgeRecord.findMany({
        where: { companyId, status: 'CANONICAL' },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { id: true, title: true, content: true, type: true, importance: true, updatedAt: true },
      }),
      this.prisma.organizationalMemory.findMany({
        where: {
          companyId,
          isArchived: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.decisionProposal.findMany({
        where: { companyId, status: { in: ['APPROVED', 'IMPLEMENTED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, title: true, recommendation: true, rationale: true, status: true, updatedAt: true },
      }),
    ]);

    return {
      knowledge: knowledge.map(k => ({ source: 'knowledge', id: k.id, title: k.title, content: k.content, type: k.type, importance: k.importance })),
      memories: memories.map(m => ({ source: 'memory', id: m.id, type: m.memoryType, subject: m.subject, content: m.content, relevance: m.relevanceScore })),
      decisions: decisions.map(d => ({ source: 'decision', id: d.id, title: d.title, recommendation: d.recommendation, status: d.status })),
    };
  }

  /** Search across both knowledge and memory systems. */
  async search(companyId: string, query: string, limit = 10) {
    const [knowledge, memories] = await Promise.all([
      this.prisma.knowledgeRecord.findMany({
        where: { companyId, OR: [{ title: { contains: query, mode: 'insensitive' } }, { content: { contains: query, mode: 'insensitive' } }] },
        take: limit,
        select: { id: true, title: true, content: true, type: true },
      }),
      this.prisma.organizationalMemory.findMany({
        where: { companyId, isArchived: false, OR: [{ subject: { contains: query, mode: 'insensitive' } }, { content: { contains: query, mode: 'insensitive' } }] },
        take: limit,
      }),
    ]);

    return [
      ...knowledge.map(k => ({ source: 'knowledge' as const, id: k.id, title: k.title, snippet: k.content.slice(0, 200) })),
      ...memories.map(m => ({ source: 'memory' as const, id: m.id, title: m.subject, snippet: m.content.slice(0, 200) })),
    ];
  }
}
