import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InquiryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntakeInput, newPublicRef, PUBLIC_STATUS, submissionHash, TRANSITIONS } from './intake';
import { InquiryAutomationService } from './inquiry-automation.service';

/** Operator-facing fields. internalNotes is included here and never in any public response. */
const OPERATOR_SELECT = {
  id: true, publicRef: true, status: true, title: true, description: true, businessName: true, contactName: true,
  contactEmail: true, contactPhone: true, serviceRequested: true, source: true, internalNotes: true, receivedAt: true, updatedAt: true,
} satisfies Prisma.ClientInquirySelect;

export interface Actor { actorId: string; actorType?: string }

@Injectable()
export class InquiryService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly automation?: InquiryAutomationService) {}

  /** Tenant for the public form: explicit target, server env configuration, or primary active company fallback. */
  async intakeCompanyId(requestedCompanyId?: string): Promise<string> {
    if (requestedCompanyId && typeof requestedCompanyId === 'string') {
      const target = await this.prisma.company.findUnique({ where: { id: requestedCompanyId }, select: { id: true, status: true } });
      if (target && target.status === 'ACTIVE') return target.id;
    }
    const envId = process.env.PUBLIC_INTAKE_COMPANY_ID?.trim();
    if (envId) {
      const envComp = await this.prisma.company.findUnique({ where: { id: envId }, select: { id: true, status: true } });
      if (!envComp || envComp.status !== 'ACTIVE') throw new ServiceUnavailableException('Requests are not being accepted right now. Please try again later.');
      return envComp.id;
    }
    const primary = await this.prisma.company.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!primary) throw new ServiceUnavailableException('Requests are not being accepted right now. Please try again later.');
    return primary.id;
  }

  /**
   * Persists a public request. Nothing is sent or published. A duplicate (same email, service and description for this
   * company) returns the original reference instead of creating a second row.
   */
  async submitPublic(v: IntakeInput, requestedCompanyId?: string) {
    const companyId = await this.intakeCompanyId(requestedCompanyId);
    const hash = submissionHash(companyId, v);
    const existing = await this.prisma.clientInquiry.findFirst({ where: { companyId, submissionHash: hash }, select: { publicRef: true, status: true } });
    if (existing?.publicRef) return { reference: existing.publicRef, status: PUBLIC_STATUS[existing.status] };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await this.prisma.clientInquiry.create({
          data: {
            companyId,
            publicRef: newPublicRef(),
            title: `${v.service.replace('_', ' ').toLowerCase()} request from ${v.businessName}`.slice(0, 200),
            description: v.description,
            businessName: v.businessName,
            contactName: v.contactName,
            contactEmail: v.email,
            contactPhone: v.phone,
            serviceRequested: v.service,
            source: 'PUBLIC_FORM',
            submissionHash: hash,
          },
          select: { id: true, publicRef: true, status: true },
        });
        await this.audit(companyId, { actorId: 'PUBLIC', actorType: 'CUSTOMER' }, 'INQUIRY_SUBMITTED', row.id, null, { status: row.status, source: 'PUBLIC_FORM' });
        // Background triage is queued only after the request is safely stored; it can never fail the submission.
        await this.automation?.enqueueSafe(companyId, row.id);
        return { reference: row.publicRef!, status: PUBLIC_STATUS[row.status] };
      } catch (e) {
        // publicRef collision (astronomically rare): try a new reference.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ServiceUnavailableException('Could not record the request. Please try again.');
  }

  /** Customer status lookup: needs both the reference and the email it was submitted with. Same 404 either way. */
  async publicStatus(reference: unknown, email: unknown) {
    if (typeof reference !== 'string' || typeof email !== 'string' || !/^REQ-[2-9A-HJKMNP-Z]{10}$/.test(reference.trim().toUpperCase())) {
      throw new NotFoundException('No request matches that reference and email');
    }
    const row = await this.prisma.clientInquiry.findUnique({ where: { publicRef: reference.trim().toUpperCase() }, select: { contactEmail: true, status: true, receivedAt: true, publicRef: true } });
    if (!row || row.contactEmail !== email.trim().toLowerCase()) throw new NotFoundException('No request matches that reference and email');
    return { reference: row.publicRef, status: PUBLIC_STATUS[row.status], submittedAt: row.receivedAt };
  }

  // ---- operator queue (tenant always from the token) ----

  list(companyId: string, status?: InquiryStatus) {
    return this.prisma.clientInquiry.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      select: OPERATOR_SELECT,
    });
  }

  async get(companyId: string, id: string) {
    const row = await this.prisma.clientInquiry.findFirst({ where: { id, companyId }, select: OPERATOR_SELECT });
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }

  /**
   * Compare-and-set transition: only succeeds if the request is still in `from`, so two operators acting on the same
   * request cannot both process it (the second gets 409 and sees the new state on reload).
   */
  async transition(companyId: string, actor: Actor, id: string, from: unknown, to: unknown) {
    if (!isStatus(from) || !isStatus(to) || !TRANSITIONS[from].includes(to)) throw new BadRequestException(`Transition ${String(from)} → ${String(to)} is not allowed`);
    if (to === 'CONVERTED') return this.convert(companyId, actor, id, from);
    await this.get(companyId, id); // 404 for foreign or missing ids before any write
    const r = await this.prisma.clientInquiry.updateMany({ where: { id, companyId, status: from }, data: { status: to } });
    if (!r.count) throw new ConflictException('The request changed since you loaded it. Reload and try again.');
    await this.audit(companyId, actor, 'INQUIRY_STATUS_CHANGED', id, { status: from }, { status: to });
    return this.get(companyId, id);
  }

  /**
   * QUALIFIED → CONVERTED. In one transaction: compare-and-set the status, reuse (by contact email, same tenant) or
   * create the Client, and create exactly one Opportunity linked to the request. If anything fails, nothing is kept,
   * so a request is never CONVERTED without its pipeline record. Sends nothing externally.
   */
  private async convert(companyId: string, actor: Actor, id: string, from: InquiryStatus) {
    const { clientId, opportunityId } = await this.prisma.$transaction(async (tx) => {
      const inq = await tx.clientInquiry.findFirst({ where: { id, companyId } });
      if (!inq) throw new NotFoundException('Request not found');
      const cas = await tx.clientInquiry.updateMany({ where: { id, companyId, status: from }, data: { status: 'CONVERTED' } });
      if (!cas.count) throw new ConflictException('The request changed since you loaded it. Reload and try again.');

      let clientId: string | null = inq.clientId ?? null;
      // Reuse only when it is the same contact email AND the same business in this tenant: one person may own
      // several different businesses, which must stay separate clients.
      const bizName = (inq.businessName || '').trim();
      if (!clientId && inq.contactEmail && bizName) {
        const sameBusiness = { equals: bizName, mode: 'insensitive' as const };
        const existing = await tx.clientContact.findFirst({
          where: { email: inq.contactEmail, client: { companyId, OR: [{ name: sameBusiness }, { organizationName: sameBusiness }] } },
          select: { clientId: true },
        });
        clientId = existing?.clientId ?? null;
      }
      if (!clientId) {
        const name = (inq.businessName || inq.contactName || 'Unnamed client').slice(0, 200);
        const client = await tx.client.create({
          data: {
            companyId,
            name,
            organizationName: inq.businessName ?? undefined,
            description: `Created from request ${inq.publicRef ?? inq.id}`,
            contacts: { create: [{ name: inq.contactName || name, email: inq.contactEmail ?? undefined, phone: inq.contactPhone ?? undefined }] },
          },
          select: { id: true },
        });
        clientId = client.id;
      }

      const existingOpp = await tx.opportunity.findFirst({ where: { companyId, inquiryId: id }, select: { id: true } });
      const opp = existingOpp ?? await tx.opportunity.create({
        data: { companyId, clientId, inquiryId: id, title: inq.title, description: inq.description, source: inq.source ?? 'INQUIRY', lastActivityAt: new Date() },
        select: { id: true },
      });
      await tx.clientInquiry.updateMany({ where: { id, companyId }, data: { clientId } });
      return { clientId, opportunityId: opp.id };
    });
    await this.audit(companyId, actor, 'INQUIRY_STATUS_CHANGED', id, { status: from }, { status: 'CONVERTED', clientId, opportunityId });
    return { ...(await this.get(companyId, id)), clientId, opportunityId };
  }


  /** Appends an internal note atomically (concurrent notes are never lost). */
  async addNote(companyId: string, actor: Actor, id: string, note: unknown) {
    const text = typeof note === 'string' ? note.trim() : '';
    if (text.length < 1 || text.length > 2000) throw new BadRequestException('Note must be 1–2000 characters');
    await this.get(companyId, id);
    const line = `[${new Date().toISOString()} ${actor.actorId}] ${text}`;
    const n = await this.prisma.$executeRaw`UPDATE "ClientInquiry" SET "internalNotes" = COALESCE("internalNotes" || E'\n', '') || ${line}, "updatedAt" = now() WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (!n) throw new NotFoundException('Request not found');
    await this.audit(companyId, actor, 'INQUIRY_NOTE_ADDED', id, null, { length: text.length });
    return this.get(companyId, id);
  }

  private audit(companyId: string, actor: Actor, action: string, objectId: string, oldValue: object | null, newValue: object | null) {
    return this.prisma.customerAuditEvent.create({
      data: { companyId, actorId: actor.actorId, actorType: actor.actorType ?? 'HUMAN', action, objectType: 'ClientInquiry', objectId, oldValue: oldValue ?? undefined, newValue: newValue ?? undefined },
    });
  }
}

const isStatus = (s: unknown): s is InquiryStatus => typeof s === 'string' && s in TRANSITIONS;
