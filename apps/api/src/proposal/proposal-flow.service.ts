import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditEvent, lockKey, PipelineActor, PLACEHOLDER_MARK, toInt, toText } from '../opportunity/pipeline-util';

/** Proposals that still count as "the" proposal for an opportunity (a repeat request returns one of these). */
const LIVE: ProposalStatus[] = ['DRAFT', 'CHAIRMAN_APPROVAL', 'SENT', 'ACCEPTED'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

const PROPOSAL_INCLUDE = {
  approvals: { orderBy: { timestamp: 'asc' } },
  opportunity: { select: { id: true, title: true, companyId: true, clientId: true, status: true } },
  customer: { select: { id: true, name: true } },
  projects: { select: { id: true, name: true, status: true } },
} satisfies Prisma.ProposalInclude;

/**
 * Tenant-scoped opportunity -> proposal workflow exposed over HTTP.
 * A proposal never leaves the system from here: "send" and "customer accepted" are explicit human records, and no
 * price, term or commitment is invented. Missing commercial values stay as DRAFT PLACEHOLDERs and block submission.
 * Proposals have no companyId of their own; the tenant is always the owning opportunity's companyId.
 */
@Injectable()
export class ProposalFlowService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- opportunities (read) ----

  listOpportunities(companyId: string) {
    return this.prisma.opportunity.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, title: true, description: true, status: true, salesStage: true, estimatedValue: true, currency: true, createdAt: true,
        client: { select: { id: true, name: true } },
        inquiry: { select: { id: true, publicRef: true } },
        proposals: { orderBy: { version: 'desc' }, select: { id: true, status: true, version: true, total: true, currency: true } },
        projects: { select: { id: true, name: true, status: true } },
      },
    });
  }

  async getOpportunity(companyId: string, id: string) {
    const row = await this.prisma.opportunity.findFirst({
      where: { id, companyId },
      include: { client: { include: { contacts: true } }, inquiry: true, proposals: { orderBy: { version: 'desc' } }, projects: true },
    });
    if (!row) throw new NotFoundException('Opportunity not found');
    return row;
  }

  // ---- proposals ----

  async listForOpportunity(companyId: string, opportunityId: string) {
    await this.getOpportunity(companyId, opportunityId);
    return this.prisma.proposal.findMany({ where: { opportunityId }, orderBy: { version: 'desc' }, include: PROPOSAL_INCLUDE });
  }

  async get(companyId: string, id: string) {
    const p = await this.prisma.proposal.findFirst({ where: { id, opportunity: { companyId } }, include: PROPOSAL_INCLUDE });
    if (!p) throw new NotFoundException('Proposal not found');
    return p;
  }

  /**
   * Builds a DRAFT from the opportunity and its originating request. Idempotent: while a live proposal exists the same
   * proposal is returned (created:false). Pass `force` to deliberately start a new version.
   */
  async generate(companyId: string, actor: PipelineActor, opportunityId: string, force = false) {
    const out = await this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `proposal:${opportunityId}`);
      const opp = await tx.opportunity.findFirst({ where: { id: opportunityId, companyId }, include: { client: true, inquiry: true } });
      if (!opp) throw new NotFoundException('Opportunity not found');
      if (opp.status === 'REJECTED' || opp.status === 'LOST' || opp.status === 'EXPIRED') throw new ConflictException('This opportunity is closed; a proposal cannot be generated.');
      const live = await tx.proposal.findFirst({ where: { opportunityId, status: { in: LIVE } }, orderBy: { version: 'desc' } });
      if (live && !force) return { proposal: live, created: false };

      const latest = await tx.proposal.findFirst({ where: { opportunityId }, orderBy: { version: 'desc' }, select: { version: true } });
      const inq = opp.inquiry;
      const requirement = [
        inq?.serviceRequested ? `Requested service: ${inq.serviceRequested.replace(/_/g, ' ').toLowerCase()}` : null,
        `Customer: ${opp.client.name}`,
        inq?.description ?? opp.description ? `Customer requirement:\n${inq?.description ?? opp.description}` : null,
        inq?.requirements ? `Additional requirements:\n${inq.requirements}` : null,
      ].filter(Boolean).join('\n\n');
      // Price comes only from data already on the opportunity; otherwise 0 and the draft cannot be submitted.
      const unitPrice = opp.estimatedValue ?? 0;
      const p = await tx.proposal.create({
        data: {
          opportunityId, customerId: opp.clientId, version: (latest?.version ?? 0) + 1,
          title: `Proposal: ${opp.title}`.slice(0, 200),
          description: opp.description ?? undefined,
          scope: requirement || `${PLACEHOLDER_MARK}: scope to be written]`,
          deliverables: `${PLACEHOLDER_MARK}: deliverables to be defined by the team]`,
          paymentTerms: undefined,
          estimatedTimeline: opp.expectedDuration ?? undefined,
          currency: opp.currency || 'INR', quantity: 1, unitPrice, total: unitPrice, proposedPrice: unitPrice,
          lineItems: [{ description: opp.title, quantity: 1, unitPrice }],
        },
      });
      await auditEvent(tx, companyId, actor, 'PROPOSAL_DRAFT_GENERATED', 'Proposal', p.id, null,
        { opportunityId, version: p.version, forced: force && !!live }, { clientId: opp.clientId });
      return { proposal: p, created: true };
    });
    return { ...out, proposal: await this.get(companyId, out.proposal.id) };
  }

  /** Draft-only edit. Totals are recomputed server-side from the inputs. */
  async update(companyId: string, actor: PipelineActor, id: string, body: Record<string, unknown>) {
    const before = await this.get(companyId, id);
    if (before.status !== 'DRAFT') throw new ConflictException('Only a draft proposal can be edited. Ask for changes first.');
    const data: Prisma.ProposalUpdateManyMutationInput = {};
    for (const k of ['title', 'scope', 'deliverables', 'assumptions', 'exclusions', 'paymentTerms'] as const) {
      const v = toText(body[k], k); if (v !== undefined) (data as any)[k] = v;
    }
    const currency = toText(body.currency, 'currency', 3)?.toUpperCase();
    if (currency !== undefined) { if (!CURRENCIES.includes(currency)) throw new BadRequestException(`currency must be one of ${CURRENCIES.join(', ')}.`); data.currency = currency; }
    const quantity = toInt(body.quantity, 'quantity', 1, 100000);
    const unitPrice = toInt(body.unitPrice, 'unitPrice');
    const discount = toInt(body.discount, 'discount');
    const tax = toInt(body.tax, 'tax');
    const timeline = toInt(body.estimatedTimeline, 'estimatedTimeline', 1, 3650);
    const validity = toInt(body.validityPeriod, 'validityPeriod', 1, 365);
    const cost = toInt(body.internalEstimatedCost, 'internalEstimatedCost');
    if (quantity !== undefined) data.quantity = quantity;
    if (unitPrice !== undefined) data.unitPrice = unitPrice;
    if (discount !== undefined) data.discount = discount;
    if (tax !== undefined) data.tax = tax;
    if (timeline !== undefined) data.estimatedTimeline = timeline;
    if (validity !== undefined) data.validityPeriod = validity;
    if (cost !== undefined) data.internalEstimatedCost = cost;
    if (Object.keys(data).length === 0) throw new BadRequestException('No editable fields were provided.');

    const q = data.quantity as number ?? before.quantity, u = data.unitPrice as number ?? before.unitPrice;
    const d = data.discount as number ?? before.discount, t = data.tax as number ?? before.tax;
    const total = q * u + t - d;
    if (total < 0) throw new BadRequestException('Discount cannot exceed the price plus tax.');
    data.total = total; data.proposedPrice = total;
    data.lineItems = [{ description: (data.title as string) ?? before.title, quantity: q, unitPrice: u }];

    const r = await this.prisma.proposal.updateMany({ where: { id, status: 'DRAFT' }, data });
    if (!r.count) throw new ConflictException('The proposal changed since you loaded it. Reload and try again.');
    await auditEvent(this.prisma, companyId, actor, 'PROPOSAL_EDITED', 'Proposal', id, null, { fields: Object.keys(data).filter((k) => !['total', 'proposedPrice', 'lineItems'].includes(k)), total }, { clientId: before.customerId });
    return this.get(companyId, id);
  }

  /** What is still missing before a draft may go to approval. Empty list = complete. */
  missingForSubmission(p: { scope: string; deliverables: string; unitPrice: number; estimatedTimeline: number | null; paymentTerms: string | null }) {
    const m: string[] = [];
    if (!p.scope.trim() || p.scope.includes(PLACEHOLDER_MARK)) m.push('scope');
    if (!p.deliverables.trim() || p.deliverables.includes(PLACEHOLDER_MARK)) m.push('deliverables');
    if (!(p.unitPrice > 0)) m.push('price');
    if (!(p.estimatedTimeline && p.estimatedTimeline > 0)) m.push('timeline');
    if (!p.paymentTerms?.trim()) m.push('payment terms');
    return m;
  }

  async submit(companyId: string, actor: PipelineActor, id: string) {
    const p = await this.get(companyId, id);
    const missing = this.missingForSubmission(p);
    if (missing.length) throw new BadRequestException(`This proposal cannot be submitted for approval yet. Missing: ${missing.join(', ')}.`);
    await this.cas(id, 'DRAFT', 'CHAIRMAN_APPROVAL');
    await auditEvent(this.prisma, companyId, actor, 'PROPOSAL_SUBMITTED_FOR_APPROVAL', 'Proposal', id, { status: 'DRAFT' }, { status: 'CHAIRMAN_APPROVAL' }, { clientId: p.customerId });
    return this.get(companyId, id);
  }

  /** Chairman decision on a submitted proposal. APPROVE is idempotent (one ledger row). Chairman-only is enforced by the controller. */
  async decide(companyId: string, actor: PipelineActor, id: string, decisionRaw: unknown, reasonRaw: unknown) {
    const decision = String(decisionRaw ?? '').toUpperCase();
    if (!['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(decision)) throw new BadRequestException('decision must be APPROVE, REJECT or REQUEST_CHANGES.');
    const reason = toText(reasonRaw, 'reason', 1000);
    if (decision !== 'APPROVE' && !reason) throw new BadRequestException('A reason is required to reject or request changes.');
    const p = await this.get(companyId, id);
    if (p.status !== 'CHAIRMAN_APPROVAL') throw new ConflictException('Only a proposal that was submitted for approval can be decided.');
    if (decision === 'APPROVE') {
      if (this.isApproved(p)) return p;
      await this.prisma.proposalApproval.create({ data: { proposalId: id, actorId: actor.actorId, decision, reason } });
    } else {
      const to: ProposalStatus = decision === 'REJECT' ? 'DECLINED' : 'DRAFT';
      await this.cas(id, 'CHAIRMAN_APPROVAL', to);
      await this.prisma.proposalApproval.create({ data: { proposalId: id, actorId: actor.actorId, decision, reason } });
    }
    await auditEvent(this.prisma, companyId, actor, `PROPOSAL_${decision}`, 'Proposal', id, { status: p.status }, { decision, reason: reason ?? null }, { clientId: p.customerId });
    return this.get(companyId, id);
  }

  /** Records that the owner sent the proposal outside AEVORA. Nothing is emailed from here. */
  async markSent(companyId: string, actor: PipelineActor, id: string) {
    const p = await this.get(companyId, id);
    if (p.status === 'SENT') return p; // idempotent
    if (p.status !== 'CHAIRMAN_APPROVAL' || !this.isApproved(p)) throw new ForbiddenException('A proposal must be approved by the Chairman before it can be marked as sent.');
    await this.cas(id, 'CHAIRMAN_APPROVAL', 'SENT');
    await auditEvent(this.prisma, companyId, actor, 'PROPOSAL_MARKED_SENT', 'Proposal', id, { status: p.status }, { status: 'SENT', note: 'recorded manually; nothing was emailed by AEVORA' }, { clientId: p.customerId });
    return this.get(companyId, id);
  }

  /** Records the customer's answer (received by the owner outside AEVORA). Accepted moves the opportunity to APPROVED. */
  async customerResponse(companyId: string, actor: PipelineActor, id: string, responseRaw: unknown) {
    const response = String(responseRaw ?? '').toUpperCase();
    if (response !== 'ACCEPTED' && response !== 'DECLINED') throw new BadRequestException('response must be ACCEPTED or DECLINED.');
    const p = await this.get(companyId, id);
    if (p.status === response) return p; // idempotent repeat
    if (p.status !== 'SENT') throw new ConflictException('Only a proposal that was marked as sent can receive a customer response.');
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.proposal.updateMany({ where: { id, status: 'SENT' }, data: { status: response as ProposalStatus } });
      if (!r.count) throw new ConflictException('The proposal changed since you loaded it. Reload and try again.');
      if (response === 'ACCEPTED') await tx.opportunity.updateMany({ where: { id: p.opportunityId, companyId }, data: { status: 'APPROVED', lastActivityAt: new Date() } });
      await auditEvent(tx, companyId, actor, `PROPOSAL_CUSTOMER_${response}`, 'Proposal', id, { status: 'SENT' }, { status: response }, { clientId: p.customerId });
    });
    return this.get(companyId, id);
  }

  // ---- project hand-off ----

  /**
   * ACCEPTED + Chairman-approved proposal -> exactly one Project, linked to the customer, opportunity and proposal.
   * Repeats return the existing project (created:false). Does not require a Contract row (none can be created in AEVORA yet).
   */
  async createProject(companyId: string, actor: PipelineActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `project-from-proposal:${id}`);
      const p = await tx.proposal.findFirst({ where: { id, opportunity: { companyId } }, include: { approvals: true, opportunity: true } });
      if (!p) throw new NotFoundException('Proposal not found');
      const existing = await tx.project.findFirst({ where: { proposalId: id, companyId } });
      if (existing) return { project: existing, created: false };
      if (p.status !== 'ACCEPTED') throw new ConflictException('A project can only be started from a proposal the customer has accepted.');
      if (!p.approvals.some((a) => a.decision === 'APPROVE')) throw new ForbiddenException('The proposal has no Chairman approval on record.');
      if (p.customerId !== p.opportunity.clientId) throw new ConflictException('Proposal customer does not match the opportunity customer.');
      const project = await tx.project.create({
        data: {
          companyId, clientId: p.opportunity.clientId, opportunityId: p.opportunityId, proposalId: p.id,
          name: (p.title ?? p.opportunity.title).replace(/^Proposal:\s*/, '').slice(0, 200), description: p.scope,
          quotedPrice: p.total, expectedRevenue: p.total, estimatedCost: p.internalEstimatedCost ?? undefined, status: 'PLANNED',
        },
      });
      await auditEvent(tx, companyId, actor, 'PROJECT_CREATED_FROM_PROPOSAL', 'Project', project.id, null,
        { proposalId: id, opportunityId: p.opportunityId, clientId: p.opportunity.clientId }, { clientId: p.opportunity.clientId, projectId: project.id });
      return { project, created: true };
    });
  }

  // ---- helpers ----

  isApproved(p: { approvals: { decision: string }[] }) {
    return p.approvals.length > 0 && p.approvals[p.approvals.length - 1].decision === 'APPROVE';
  }

  private async cas(id: string, from: ProposalStatus, to: ProposalStatus) {
    const r = await this.prisma.proposal.updateMany({ where: { id, status: from }, data: { status: to } });
    if (!r.count) throw new ConflictException('The proposal changed since you loaded it. Reload and try again.');
  }
}
