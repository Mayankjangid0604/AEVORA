import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceKind, FeedbackKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { daysLeft, monthKey } from './screens.logic';

const IST_MS = 330 * 60_000;
const monthStart = (d: Date) => { const mk = monthKey(d); return new Date(Date.UTC(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1) - IST_MS); };
const COMPLIANCE_KINDS: ComplianceKind[] = ['GST', 'TDS', 'ROC', 'INCOME_TAX', 'PF_ESI', 'OTHER'];

/** Rating counts 1..5 for the satisfaction pie (reviews only). */
export function ratingCounts(ratings: (number | null)[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const r of ratings) if (r && r >= 1 && r <= 5) out[r - 1]++;
  return out;
}

/** Room screens for Customer Support, Finance, Legal & Compliance, CEO office, the atrium knowledge graph and the rest. */
@Injectable()
export class RoomScreensService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Customer Support (#12) ─────────────────────────────────────────────────
  async support(companyId: string, now = new Date()) {
    const since = monthStart(now);
    const [complaints, reviews] = await Promise.all([
      this.prisma.customerFeedback.findMany({ where: { companyId, kind: 'COMPLAINT', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.customerFeedback.findMany({ where: { companyId, kind: 'REVIEW' }, orderBy: { createdAt: 'desc' }, take: 200, select: { customerName: true, subject: true, details: true, rating: true, createdAt: true } }),
    ]);
    const open = complaints.filter((c) => c.status === 'OPEN').length;
    return {
      complaints: { total: complaints.length, open, resolved: complaints.length - open, list: complaints.slice(0, 8).map((c) => ({ id: c.id, customer: c.customerName, subject: c.subject, status: c.status, at: c.createdAt })) },
      satisfaction: { ratings: ratingCounts(reviews.map((r) => r.rating)), reviews: reviews.length, latest: reviews.slice(0, 4) },
    };
  }

  async addFeedback(companyId: string, body: { kind: string; customerName: string; subject: string; details?: string; rating?: number; clientId?: string; leadId?: string }) {
    const kind = body?.kind === 'REVIEW' ? FeedbackKind.REVIEW : body?.kind === 'COMPLAINT' ? FeedbackKind.COMPLAINT : null;
    if (!kind) throw new BadRequestException('kind must be COMPLAINT or REVIEW');
    const customerName = String(body.customerName ?? '').trim().slice(0, 120), subject = String(body.subject ?? '').trim().slice(0, 200);
    if (!customerName || !subject) throw new BadRequestException('customerName and subject are required');
    const rating = body.rating == null ? null : Number(body.rating);
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new BadRequestException('rating must be 1-5');
    if (kind === 'REVIEW' && rating === null) throw new BadRequestException('a review needs a rating (1-5)');
    return this.prisma.customerFeedback.create({ data: { companyId, kind, customerName, subject, details: body.details?.slice(0, 2000) ?? null, rating, clientId: body.clientId ?? null, leadId: body.leadId ?? null } });
  }

  async resolveFeedback(companyId: string, id: string) {
    const r = await this.prisma.customerFeedback.updateMany({ where: { id, companyId, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    if (!r.count) throw new NotFoundException('Open feedback not found');
    return { id, status: 'RESOLVED' };
  }

  // ── Finance (#13) — integer paise throughout ──────────────────────────────
  async finance(companyId: string, now = new Date()) {
    const since = monthStart(now);
    const [account, income, expenses, invoices, pendingProjects, proposals] = await Promise.all([
      this.prisma.realMoneyAccount.findUnique({ where: { companyId }, select: { balance: true } }),
      this.prisma.revenueRecord.aggregate({ where: { companyId, status: 'RECEIVED', receivedAt: { gte: since } }, _sum: { amount: true }, _count: true }),
      this.prisma.companyExpense.aggregate({ where: { companyId, status: 'PAID', paidAt: { gte: since } }, _sum: { amount: true }, _count: true }),
      this.prisma.invoice.findMany({ where: { companyId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' }, take: 20, select: { id: true, invoiceNumber: true, total: true, status: true, dueDate: true, client: { select: { name: true } } } }),
      this.prisma.clientProject.findMany({ where: { companyId, status: 'INVOICED' }, take: 20, select: { id: true, quotedAmount: true, lead: { select: { name: true } }, updatedAt: true } }),
      this.prisma.proposal.findMany({ where: { opportunity: { companyId }, status: { in: ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CHAIRMAN_APPROVAL'] } }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, status: true, total: true, currency: true, createdAt: true } }),
    ]);
    const incomePaise = income._sum.amount ?? 0, expensePaise = expenses._sum.amount ?? 0;
    return {
      balancePaise: account?.balance ?? null,
      month: monthKey(now),
      incomePaise, expensePaise, netPaise: incomePaise - expensePaise, incomeCount: income._count, expenseCount: expenses._count,
      outstandingInvoices: { count: invoices.length, totalPaise: invoices.reduce((a, i) => a + i.total, 0), list: invoices.slice(0, 6).map((i) => ({ number: i.invoiceNumber, client: i.client?.name ?? null, totalPaise: i.total, status: i.status, due: i.dueDate })) },
      pendingPayments: { count: pendingProjects.length, totalPaise: pendingProjects.reduce((a, p) => a + (p.quotedAmount ?? 0), 0), list: pendingProjects.slice(0, 6).map((p) => ({ client: p.lead.name, amountPaise: p.quotedAmount ?? 0, since: p.updatedAt })) },
      quotations: { byStatus: proposals.reduce<Record<string, number>>((a, p) => ({ ...a, [p.status]: (a[p.status] ?? 0) + 1 }), {}), latest: proposals.slice(0, 5) },
    };
  }

  // ── Legal & Compliance (#14) ──────────────────────────────────────────────
  async legal(companyId: string, now = new Date()) {
    const [filings, contracts, approvals] = await Promise.all([
      this.prisma.complianceFiling.findMany({ where: { companyId, filedAt: null }, orderBy: { dueDate: 'asc' }, take: 20 }),
      this.prisma.contract.findMany({ where: { companyId, status: { in: ['DRAFT', 'REVIEW', 'APPROVED'] } }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, updatedAt: true } }),
      this.prisma.approvalRequest.findMany({ where: { companyId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, action: true, targetType: true, riskLevel: true, financialImpact: true, createdAt: true } }),
    ]);
    return {
      filings: filings.map((f) => ({ id: f.id, kind: f.kind, title: f.title, dueDate: f.dueDate, daysLeft: daysLeft(f.dueDate, now) })),
      contractsAwaitingSignature: contracts,
      approvalsPending: approvals,
    };
  }

  async addFiling(companyId: string, body: { kind: string; title: string; dueDate: string; notes?: string }) {
    const kind = COMPLIANCE_KINDS.find((k) => k === body?.kind);
    if (!kind) throw new BadRequestException(`kind must be one of ${COMPLIANCE_KINDS.join(', ')}`);
    const title = String(body.title ?? '').trim().slice(0, 200), due = new Date(body.dueDate);
    if (!title || Number.isNaN(due.getTime())) throw new BadRequestException('title and a valid dueDate are required');
    return this.prisma.complianceFiling.create({ data: { companyId, kind, title, dueDate: due, notes: body.notes?.slice(0, 1000) ?? null } });
  }

  async markFiled(companyId: string, id: string) {
    const r = await this.prisma.complianceFiling.updateMany({ where: { id, companyId, filedAt: null }, data: { filedAt: new Date() } });
    if (!r.count) throw new NotFoundException('Open filing not found');
    return { id, filed: true };
  }

  async deleteFiling(companyId: string, id: string) {
    const r = await this.prisma.complianceFiling.deleteMany({ where: { id, companyId } });
    if (!r.count) throw new NotFoundException('Filing not found');
    return { id, deleted: true };
  }

  // ── CEO office (#16): S1 growth comes from /office/screens/research ────────
  async ceo(companyId: string) {
    const [ideas, weekly, reviews] = await Promise.all([
      this.prisma.startupIdea.findMany({ where: { companyId }, orderBy: [{ createdAt: 'desc' }], take: 12, select: { id: true, title: true, status: true, ceoScore: true, source: true, createdAt: true } }),
      this.prisma.weeklyReport.findMany({ where: { companyId }, orderBy: { weekStartDate: 'desc' }, take: 3, select: { id: true, weekStartDate: true, dealsWonCount: true, revenueEarnedPaise: true, biggestChallenge: true } }),
      this.prisma.ceoReview.findMany({ where: { companyId }, orderBy: { reviewedAt: 'desc' }, take: 3, select: { id: true, reviewedAt: true, topRisk: true, topOpportunity: true, survivalStatus: true } }),
    ]);
    const top = [...ideas].filter((i) => i.ceoScore != null).sort((a, b) => b.ceoScore! - a.ceoScore!).slice(0, 3);
    return { ideas: { latest: ideas.slice(0, 5), top }, reports: { weekly, reviews } };
  }

  // ── Marketing (#15 audit: its TVs showed a decorative fake chart) ─────────
  async marketing(companyId: string, now = new Date()) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [campaigns, posts] = await Promise.all([
      this.prisma.marketingCampaign.findMany({ where: { companyId, status: { in: ['ACTIVE', 'APPROVED', 'PLANNED'] } }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, status: true } }),
      this.prisma.contentPost.findMany({ where: { companyId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, platform: true, contentType: true, caption: true, status: true, createdAt: true } }),
    ]);
    return {
      campaigns,
      posts: { byStatus: posts.reduce<Record<string, number>>((a, p) => ({ ...a, [p.status]: (a[p.status] ?? 0) + 1 }), {}), latest: posts.slice(0, 4).map((p) => ({ ...p, caption: p.caption.slice(0, 120) })) },
    };
  }

  // ── Atrium knowledge graph (#17) ──────────────────────────────────────────
  async knowledgeGraph(companyId: string) {
    const [topics, projects, clients, employees] = await Promise.all([
      this.prisma.knowledgeRecord.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 24, select: { id: true, title: true, type: true, projectId: true, createdByEmployeeId: true } }),
      this.prisma.project.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 16, select: { id: true, name: true, clientId: true, assignments: { select: { employeeId: true }, take: 6 } } }),
      this.prisma.client.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 16, select: { id: true, name: true } }),
      this.prisma.employee.findMany({ where: { companyId, status: 'ACTIVE' }, orderBy: { hireDate: 'asc' }, take: 24, select: { id: true, name: true } }),
    ]);
    const nodes = [
      ...topics.map((t) => ({ id: `k:${t.id}`, label: t.title, kind: 'topic', detail: t.type })),
      ...projects.map((p) => ({ id: `p:${p.id}`, label: p.name, kind: 'project' })),
      ...clients.map((c) => ({ id: `c:${c.id}`, label: c.name, kind: 'client' })),
      ...employees.map((e) => ({ id: `e:${e.id}`, label: e.name, kind: 'employee' })),
    ];
    const ids = new Set(nodes.map((n) => n.id)), links: [string, string][] = [];
    const link = (a: string, b: string) => { if (ids.has(a) && ids.has(b)) links.push([a, b]); };
    for (const t of topics) { if (t.projectId) link(`k:${t.id}`, `p:${t.projectId}`); if (t.createdByEmployeeId) link(`k:${t.id}`, `e:${t.createdByEmployeeId}`); }
    for (const p of projects) { link(`p:${p.id}`, `c:${p.clientId}`); for (const a of p.assignments) link(`p:${p.id}`, `e:${a.employeeId}`); }
    return { nodes, links };
  }
}
