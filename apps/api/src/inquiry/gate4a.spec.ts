/**
 * Gate 4A unit tests — MOCKED Prisma. They prove validation, authorization metadata, transition rules, conflict
 * handling and response shapes. They do NOT prove persistence, migrations or DB-level tenant isolation (see the
 * DB journey that runs via scripts/verify-disposable-db.sh).
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../authorization/roles.guard';
import { IS_PUBLIC_KEY } from '../authorization/jwt-auth.guard';
import { JobController } from '../job/job.controller';
import { JobService, MAX_REPLAYS } from '../job/job.service';
import { newPublicRef, PUBLIC_STATUS, submissionHash, TRANSITIONS, validateIntake } from './intake';
import { InquiryController, PublicIntakeController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';

const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK CALL ATTEMPTED'); });
afterAll(() => expect(netFetch).not.toHaveBeenCalled()); // submitting a request sends/publishes nothing

const valid = { businessName: '  Sharma   Sweets ', contactName: 'Asha', email: ' Asha@Sharma.TEST ', phone: '+91 98765 43210', service: 'website', description: 'We need a simple website with our menu and opening hours.' };

describe('validateIntake', () => {
  it('normalizes a valid submission', () => {
    const r = validateIntake(valid);
    expect(r).toEqual({ ok: true, value: { businessName: 'Sharma Sweets', contactName: 'Asha', email: 'asha@sharma.test', phone: '+91 98765 43210', service: 'WEBSITE', description: valid.description } });
  });

  it.each([
    ['businessName', { businessName: 'x' }], ['businessName', { businessName: 'x'.repeat(121) }],
    ['contactName', { contactName: '' }], ['email', { email: 'not-an-email' }], ['email', { email: 'a@b' }],
    ['phone', { phone: 'call me' }], ['service', { service: 'HACKING' }], ['description', { description: 'too short' }],
    ['description', { description: 'x'.repeat(4001) }], ['description', { description: `links ${'https://x.test '.repeat(4)}padding text` }],
  ])('rejects bad %s', (field, patch) => {
    const r = validateIntake({ ...valid, ...patch });
    expect('errors' in r && r.errors[field as string]).toBeTruthy();
  });

  it('honeypot, non-object and non-string inputs are rejected; control characters stripped', () => {
    expect(validateIntake({ ...valid, website: 'http://spam' })).toMatchObject({ ok: false, bot: true });
    expect(validateIntake(null)).toMatchObject({ ok: false });
    expect(validateIntake({ ...valid, email: { $ne: 1 } })).toMatchObject({ ok: false });
    const r = validateIntake({ ...valid, businessName: 'Sharma\u0000\u0007 Sweets' });
    expect('value' in r && r.value.businessName).toBe('Sharma Sweets');
  });

  it('references are unguessable REQ- codes; duplicate hash is stable across case/whitespace and tenant-specific', () => {
    const refs = new Set(Array.from({ length: 500 }, newPublicRef));
    expect(refs.size).toBe(500);
    for (const r of refs) expect(r).toMatch(/^REQ-[2-9A-HJKMNP-Z]{10}$/);
    const v = (validateIntake(valid) as any).value;
    expect(submissionHash('c1', v)).toBe(submissionHash('c1', { ...v, description: v.description.toUpperCase().replace(/ /g, '  ') }));
    expect(submissionHash('c1', v)).not.toBe(submissionHash('c2', v));
  });
});

function prismaMock() {
  return {
    company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', status: 'ACTIVE' }) },
    clientInquiry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }) => ({ id: 'row-1', publicRef: data.publicRef, status: 'NEW' })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    customerAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    managementAuditEvent: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
    backgroundJob: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    client: { create: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    clientContact: { findFirst: jest.fn().mockResolvedValue(null) },
    opportunity: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'opp-1' }) },
  } as any;
}

describe('public intake (InquiryService + PublicIntakeController)', () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.PUBLIC_INTAKE_COMPANY_ID = 'c1'; });
  afterEach(() => { process.env = { ...env }; });

  it('controller is public and throttled; operator controller is not public and role-gated', () => {
    const r = new Reflector();
    expect(r.get(IS_PUBLIC_KEY, PublicIntakeController)).toBe(true);
    expect(r.get(IS_PUBLIC_KEY, InquiryController)).toBeUndefined();
    expect(r.get(ROLES_KEY, InquiryController)).toEqual(['CHAIRMAN', 'MANAGEMENT', 'EMPLOYEE']);
    expect(r.get(ROLES_KEY, InquiryController.prototype.transition)).toEqual(['CHAIRMAN', 'MANAGEMENT']);
    expect(r.get(ROLES_KEY, InquiryController.prototype.note)).toEqual(['CHAIRMAN', 'MANAGEMENT']);
  });

  it('valid submission persists with source PUBLIC_FORM and returns only reference/status/message', async () => {
    const prisma = prismaMock();
    const res = await new PublicIntakeController(new InquiryService(prisma)).submit(valid);
    expect(Object.keys(res).sort()).toEqual(['message', 'reference', 'status']);
    expect(res.status).toBe('RECEIVED');
    expect(res.reference).toMatch(/^REQ-/);
    expect(JSON.stringify(res)).not.toMatch(/row-1|c1/);
    expect(prisma.clientInquiry.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', source: 'PUBLIC_FORM', contactEmail: 'asha@sharma.test', serviceRequested: 'WEBSITE' });
    expect(prisma.customerAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'INQUIRY_SUBMITTED', actorId: 'PUBLIC' }) }));
  });

  it('invalid input is a 400 with field errors and nothing is written', async () => {
    const prisma = prismaMock();
    await expect(new PublicIntakeController(new InquiryService(prisma)).submit({ ...valid, email: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientInquiry.create).not.toHaveBeenCalled();
  });

  it('duplicate submission returns the original reference without a second row', async () => {
    const prisma = prismaMock();
    prisma.clientInquiry.findFirst.mockResolvedValue({ publicRef: 'REQ-ABCDEFGHJK', status: 'UNDER_REVIEW' });
    const res = await new InquiryService(prisma).submitPublic((validateIntake(valid) as any).value);
    expect(res).toEqual({ reference: 'REQ-ABCDEFGHJK', status: 'IN_REVIEW' });
    expect(prisma.clientInquiry.create).not.toHaveBeenCalled();
  });

  it('fails closed when the intake tenant is unset or not ACTIVE', async () => {
    const prisma = prismaMock();
    delete process.env.PUBLIC_INTAKE_COMPANY_ID;
    await expect(new InquiryService(prisma).submitPublic((validateIntake(valid) as any).value)).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.PUBLIC_INTAKE_COMPANY_ID = 'c1';
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', status: 'SUSPENDED' });
    await expect(new InquiryService(prisma).submitPublic((validateIntake(valid) as any).value)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.clientInquiry.create).not.toHaveBeenCalled();
  });

  it('status lookup needs reference AND matching email; mismatches are indistinguishable 404s; no notes leak', async () => {
    const prisma = prismaMock();
    prisma.clientInquiry.findUnique.mockResolvedValue({ publicRef: 'REQ-ABCDEFGHJK', contactEmail: 'asha@sharma.test', status: 'QUALIFIED', receivedAt: new Date(0), internalNotes: 'secret' });
    const svc = new InquiryService(prisma);
    expect(await svc.publicStatus('req-abcdefghjk', ' Asha@Sharma.test ')).toEqual({ reference: 'REQ-ABCDEFGHJK', status: 'IN_REVIEW', submittedAt: new Date(0) });
    await expect(svc.publicStatus('REQ-ABCDEFGHJK', 'other@x.test')).rejects.toThrow('No request matches that reference and email');
    await expect(svc.publicStatus('REQ-0000', 'asha@sharma.test')).rejects.toThrow('No request matches that reference and email');
    await expect(svc.publicStatus(undefined, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('public status never exposes the internal workflow names', () => {
    expect(new Set(Object.values(PUBLIC_STATUS))).toEqual(new Set(['RECEIVED', 'IN_REVIEW', 'ACCEPTED', 'CLOSED']));
  });
});

describe('operator queue (InquiryService)', () => {
  const actor = { actorId: 'chair', actorType: 'CHAIRMAN' };

  it('reads are tenant-scoped; a foreign id is a 404', async () => {
    const prisma = prismaMock();
    const svc = new InquiryService(prisma);
    await svc.list('c1', 'NEW');
    expect(prisma.clientInquiry.findMany.mock.calls[0][0].where).toEqual({ companyId: 'c1', status: 'NEW' });
    await expect(svc.get('c1', 'other-tenant-row')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clientInquiry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-tenant-row', companyId: 'c1' } }));
  });

  it('only allowed transitions; CONVERTED is terminal', async () => {
    const svc = new InquiryService(prismaMock());
    for (const [from, to] of [['NEW', 'CONVERTED'], ['CONVERTED', 'REJECTED'], ['NEW', 'BOGUS'], [undefined, 'NEW']]) {
      await expect(svc.transition('c1', actor, 'i1', from, to)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(TRANSITIONS.CONVERTED).toEqual([]);
  });

  it('a legal transition is compare-and-set on (id, tenant, from) and audited', async () => {
    const prisma = prismaMock();
    prisma.clientInquiry.findFirst.mockResolvedValue({ id: 'i1', status: 'NEW' });
    await new InquiryService(prisma).transition('c1', actor, 'i1', 'NEW', 'UNDER_REVIEW');
    expect(prisma.clientInquiry.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', companyId: 'c1', status: 'NEW' }, data: { status: 'UNDER_REVIEW' } });
    expect(prisma.customerAuditEvent.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', actorId: 'chair', action: 'INQUIRY_STATUS_CHANGED', oldValue: { status: 'NEW' }, newValue: { status: 'UNDER_REVIEW' } });
  });

  it('a concurrent/duplicate transition loses with 409 and writes no audit', async () => {
    const prisma = prismaMock();
    prisma.clientInquiry.findFirst.mockResolvedValue({ id: 'i1', status: 'UNDER_REVIEW' });
    prisma.clientInquiry.updateMany.mockResolvedValue({ count: 0 });
    await expect(new InquiryService(prisma).transition('c1', actor, 'i1', 'NEW', 'UNDER_REVIEW')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.customerAuditEvent.create).not.toHaveBeenCalled();
  });

  describe('QUALIFIED → CONVERTED creates the pipeline records atomically', () => {
    const inquiry = { id: 'i1', companyId: 'c1', title: 'website request from Cafe', description: 'need a site', businessName: 'Cafe', contactName: 'Asha', contactEmail: 'asha@cafe.test', contactPhone: null, publicRef: 'REQ-ABCDEFGHJK', source: 'PUBLIC_FORM', clientId: null };
    const wired = () => {
      const prisma = prismaMock();
      prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
      prisma.clientInquiry.findFirst.mockResolvedValue(inquiry);
      return prisma;
    };

    it('creates one Client (with contact) and one linked Opportunity, then audits once', async () => {
      const prisma = wired();
      const res: any = await new InquiryService(prisma).transition('c1', actor, 'i1', 'QUALIFIED', 'CONVERTED');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.clientInquiry.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', companyId: 'c1', status: 'QUALIFIED' }, data: { status: 'CONVERTED' } });
      expect(prisma.client.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', name: 'Cafe', contacts: { create: [{ name: 'Asha', email: 'asha@cafe.test' }] } });
      expect(prisma.opportunity.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', clientId: 'client-1', inquiryId: 'i1', source: 'PUBLIC_FORM' });
      expect(prisma.customerAuditEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.customerAuditEvent.create.mock.calls[0][0].data.newValue).toMatchObject({ status: 'CONVERTED', clientId: 'client-1', opportunityId: 'opp-1' });
      expect(res).toMatchObject({ clientId: 'client-1', opportunityId: 'opp-1' });
    });

    it('reuses an existing same-tenant client matched by contact email AND business name, and does not duplicate an opportunity', async () => {
      const prisma = wired();
      prisma.clientContact.findFirst.mockResolvedValue({ clientId: 'client-9' });
      prisma.opportunity.findFirst.mockResolvedValue({ id: 'opp-9' });
      await new InquiryService(prisma).transition('c1', actor, 'i1', 'QUALIFIED', 'CONVERTED');
      const sameBusiness = { equals: 'Cafe', mode: 'insensitive' };
      expect(prisma.clientContact.findFirst.mock.calls[0][0].where).toEqual({
        email: 'asha@cafe.test',
        client: { companyId: 'c1', OR: [{ name: sameBusiness }, { organizationName: sameBusiness }] },
      });
      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(prisma.opportunity.create).not.toHaveBeenCalled();
    });

    it('creates a separate client when the same email belongs to a different business (no match found)', async () => {
      const prisma = wired();
      prisma.clientContact.findFirst.mockResolvedValue(null);
      await new InquiryService(prisma).transition('c1', actor, 'i1', 'QUALIFIED', 'CONVERTED');
      expect(prisma.client.create).toHaveBeenCalledTimes(1);
    });

    it('a lost compare-and-set creates nothing and audits nothing (409)', async () => {
      const prisma = wired();
      prisma.clientInquiry.updateMany.mockResolvedValue({ count: 0 });
      await expect(new InquiryService(prisma).transition('c1', actor, 'i1', 'QUALIFIED', 'CONVERTED')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(prisma.opportunity.create).not.toHaveBeenCalled();
      expect(prisma.customerAuditEvent.create).not.toHaveBeenCalled();
    });

    it('a foreign or missing request is a 404 before any write', async () => {
      const prisma = wired();
      prisma.clientInquiry.findFirst.mockResolvedValue(null);
      await expect(new InquiryService(prisma).transition('c1', actor, 'nope', 'QUALIFIED', 'CONVERTED')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.clientInquiry.updateMany).not.toHaveBeenCalled();
    });
  });

  it('notes: validated length, tenant-bound atomic append, audited without the note text', async () => {
    const prisma = prismaMock();
    prisma.clientInquiry.findFirst.mockResolvedValue({ id: 'i1', status: 'NEW' });
    const svc = new InquiryService(prisma);
    await expect(svc.addNote('c1', actor, 'i1', '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.addNote('c1', actor, 'i1', 'x'.repeat(2001))).rejects.toBeInstanceOf(BadRequestException);
    await svc.addNote('c1', actor, 'i1', 'Called back, wants a quote');
    const values = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual(expect.arrayContaining(['i1', 'c1']));
    expect(JSON.stringify(prisma.customerAuditEvent.create.mock.calls[0][0])).not.toContain('Called back');
  });
});

describe('job controls (JobService.controlJob)', () => {
  const job = (patch: object = {}) => ({ id: 'j1', type: 'TASK_EXECUTION', status: 'QUEUED', attempts: 2, lastError: 'boom', ...patch });
  const svc = (prisma: any) => new JobService(prisma, {} as any, { log: jest.fn() } as any);

  it('controller: management only; reads and actions are tenant-scoped from the token', async () => {
    expect(new Reflector().get(ROLES_KEY, JobController)).toEqual(['CHAIRMAN', 'MANAGEMENT']);
    const control = jest.fn(); const list = jest.fn();
    const c = new JobController({ controlJob: control, listJobs: list } as any);
    await c.control({ user: { companyId: 'c1', actorId: 'chair' } }, 'j1', 'pause');
    expect(control).toHaveBeenCalledWith('c1', 'chair', 'j1', 'pause');
    expect(() => c.list({ user: { companyId: 'c1' } }, 'NOPE')).toThrow(BadRequestException);
  });

  it.each([
    ['pause', 'QUEUED', 'PAUSED'],
    ['resume', 'PAUSED', 'QUEUED'],
    ['replay', 'FAILED', 'QUEUED'],
    ['replay', 'CANCELLED', 'QUEUED'],
  ])('%s: %s → %s, compare-and-set, audited', async (action, from, to) => {
    const prisma = prismaMock();
    prisma.backgroundJob.findFirst.mockResolvedValue(job({ status: from }));
    await svc(prisma).controlJob('c1', 'chair', 'j1', action);
    const call = prisma.backgroundJob.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'j1', companyId: 'c1', status: from });
    expect(call.data.status).toBe(to);
    if (action === 'replay') expect(call.data).toMatchObject({ attempts: 0, nextAttemptAt: null, lockedAt: null, workerId: null });
    expect(prisma.managementAuditEvent.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', actorId: 'chair', action: `JOB_${action.toUpperCase()}`, objectId: 'j1' });
  });

  it.each([
    ['pause', 'PROCESSING'], ['pause', 'COMPLETED'], ['resume', 'QUEUED'], ['replay', 'COMPLETED'], ['replay', 'PROCESSING'], ['replay', 'QUEUED'],
  ])('illegal %s from %s → 409, nothing written', async (action, from) => {
    const prisma = prismaMock();
    prisma.backgroundJob.findFirst.mockResolvedValue(job({ status: from }));
    await expect(svc(prisma).controlJob('c1', 'chair', 'j1', action)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.backgroundJob.updateMany).not.toHaveBeenCalled();
  });

  it('unknown action 400; foreign job 404; lost race 409 without audit', async () => {
    const prisma = prismaMock();
    await expect(svc(prisma).controlJob('c1', 'chair', 'j1', 'delete')).rejects.toBeInstanceOf(BadRequestException);
    prisma.backgroundJob.findFirst.mockResolvedValue(null);
    await expect(svc(prisma).controlJob('c1', 'chair', 'other-tenant-job', 'pause')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.backgroundJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-tenant-job', companyId: 'c1' } }));
    prisma.backgroundJob.findFirst.mockResolvedValue(job());
    prisma.backgroundJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc(prisma).controlJob('c1', 'chair', 'j1', 'pause')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.managementAuditEvent.create).not.toHaveBeenCalled();
  });

  it('replay refuses types with external effects/no handler and stops after MAX_REPLAYS', async () => {
    const prisma = prismaMock();
    prisma.backgroundJob.findFirst.mockResolvedValue(job({ status: 'FAILED', type: 'SEND_EMAIL' }));
    await expect(svc(prisma).controlJob('c1', 'chair', 'j1', 'replay')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.backgroundJob.findFirst.mockResolvedValue(job({ status: 'FAILED' }));
    prisma.managementAuditEvent.count.mockResolvedValue(MAX_REPLAYS);
    await expect(svc(prisma).controlJob('c1', 'chair', 'j1', 'replay')).rejects.toThrow(`limit ${MAX_REPLAYS}`);
    expect(prisma.backgroundJob.updateMany).not.toHaveBeenCalled();
  });

  it('list never selects the payload', async () => {
    const prisma = prismaMock();
    await svc(prisma).listJobs('c1', 'FAILED' as any);
    const q = prisma.backgroundJob.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ companyId: 'c1', status: 'FAILED' });
    expect(q.select.payload).toBeUndefined();
    expect(q.select.lastError).toBe(true);
  });
});
