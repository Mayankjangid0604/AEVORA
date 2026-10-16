/**
 * Customer simulation (synthetic data, disposable Postgres :5444 ONLY): the 15 scenarios in
 * test-data/customer-simulation-scenarios.json go through the REAL HTTP stack (real JwtAuthGuard, RolesGuard,
 * controllers, services, Postgres) as a public customer, then as operators of tenant A and a stranger from tenant B.
 * Run via scripts/verify-disposable-db.sh (matches "e2e.spec"). Nothing is sent or published.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { InquiryController, PublicIntakeController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';
import { InquiryAutomationService } from './inquiry-automation.service';
import { JobService } from '../job/job.service';
import { SalesOpportunityService } from '../sales/sales-opportunity.service';
import { SalesAuditService } from '../sales/sales-audit.service';

const run = process.env.E2E_DB === '1' && /:(5444)\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

const data = JSON.parse(readFileSync(join(__dirname, '../../test-data/customer-simulation-scenarios.json'), 'utf8')) as {
  testRunId: string; contactEmail: string;
  scenarios: { n: number; case: string; businessName: string; contactName: string; phone: string; service: string; description: string }[];
};
const refTag = (n: number) => `${data.testRunId}-${String(n).padStart(2, '0')}`;
const payload = (s: (typeof data.scenarios)[number]) => ({
  businessName: s.businessName, contactName: s.contactName, email: data.contactEmail, phone: s.phone, service: s.service,
  description: `${s.description} [${refTag(s.n)}]`,
});

run('Customer simulation: 15 scenarios, intake → CRM → conversion (real HTTP + disposable DB)', () => {
  jest.setTimeout(120_000);
  const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK CALL ATTEMPTED'); });
  const prisma = new PrismaService();
  const SECRET = 'customer-simulation-secret';
  const tag = `sim-${Date.now()}`;
  let app: any; let jwt: JwtService; let A: string; let B: string; let chairmanId: string;
  const refs = new Map<number, string>();
  const http = () => request(app.getHttpServer());
  const as = (p: any, company?: string) => ({ Authorization: `Bearer ${jwt.sign(p)}`, ...(company ? { 'x-company-id': company } : {}) });
  const chairA = () => as({ actorId: chairmanId, actorRole: 'CHAIRMAN' }, A);
  const empA = () => as({ actorId: 'sim-emp-A', actorRole: 'EMPLOYEE', companyId: A });
  const mgrB = () => as({ actorId: 'sim-mgr-B', actorRole: 'MANAGEMENT', companyId: B });
  const rowOf = (n: number) => prisma.clientInquiry.findFirstOrThrow({ where: { companyId: A, publicRef: refs.get(n)! } });
  const move = async (n: number, from: string, to: string) => {
    const row = await rowOf(n);
    return http().post(`/inquiries/${row.id}/transition`).set(chairA()).send({ from, to });
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const chairman = await prisma.chairman.findFirstOrThrow();
    chairmanId = chairman.id;
    const companies = [] as string[];
    for (const l of ['A', 'B']) companies.push((await prisma.company.create({ data: { name: `${tag}-${l}`, chairmanId } })).id);
    [A, B] = companies;
    process.env.PUBLIC_INTAKE_COMPANY_ID = A;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } })],
      controllers: [PublicIntakeController, InquiryController],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, InquiryService, { provide: PrismaService, useValue: prisma },
        // Background triage is covered by proposal/pipeline.e2e.spec.ts; here the queue is stubbed so this suite stays about intake -> CRM.
        { provide: InquiryAutomationService, useValue: { enqueueSafe: async () => null, enqueue: async () => null, status: async () => ({ enabled: true, state: 'NOT_QUEUED' }) } }, { provide: JobService, useValue: {} }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    for (const companyId of [A, B].filter(Boolean)) {
      await prisma.customerAuditEvent.deleteMany({ where: { companyId } });
      await prisma.opportunity.deleteMany({ where: { companyId } });
      await prisma.clientInquiry.deleteMany({ where: { companyId } });
      await prisma.clientContact.deleteMany({ where: { client: { companyId } } });
      await prisma.client.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch((e) => console.warn(`left behind: ${e.message}`));
    }
    await prisma.$disconnect();
    expect(netFetch).not.toHaveBeenCalled();
  });

  it('dataset: 15 scenarios, 6 business cases first, one shared contact email, unique names/refs', () => {
    expect(data.scenarios).toHaveLength(15);
    expect(data.scenarios.slice(0, 6).map((s) => s.case)).toEqual(['Hostel', 'Hotel', 'Restaurant', 'Gym', 'B2B business', 'B2C business']);
    expect(new Set(data.scenarios.map((s) => s.contactName)).size).toBe(15);
    expect(new Set(data.scenarios.map((s) => s.description)).size).toBe(15);
    expect(data.contactEmail).toBe('mayankjangid598@gmail.com');
  });

  it('invalid submissions are rejected with field errors and persist nothing', async () => {
    const good = payload(data.scenarios[0]);
    const bad = [
      { ...good, businessName: '' }, { ...good, contactName: 'x' }, { ...good, email: 'not-an-email' }, { ...good, phone: 'abc' },
      { ...good, service: 'MAGIC' }, { ...good, description: 'too short' }, { ...good, website: 'http://spam.test' },
      { ...good, description: 'a'.repeat(20) + ' http://a.test http://b.test http://c.test http://d.test' },
    ];
    for (const b of bad) await http().post('/public/requests').send(b).expect(400);
    const r = await http().post('/public/requests').send({ ...good, email: 'bad' }).expect(400);
    expect(r.body.errors.email).toBeTruthy();
    expect(await prisma.clientInquiry.count({ where: { companyId: A } })).toBe(0);
  });

  it('submits all 15 inquiries through POST /public/requests and each gets a unique customer reference', async () => {
    for (const s of data.scenarios) {
      const res = await http().post('/public/requests').send(payload(s)).expect(201);
      expect(res.body.reference).toMatch(/^REQ-[2-9A-HJKMNP-Z]{10}$/);
      expect(res.body.status).toBe('RECEIVED');
      expect(JSON.stringify(res.body)).not.toMatch(/companyId|internalNotes|"id"/);
      refs.set(s.n, res.body.reference);
    }
    expect(new Set(refs.values()).size).toBe(15);
  });

  it('all 15 are persisted in Postgres with the right fields (not just HTTP 201)', async () => {
    const rows = await prisma.clientInquiry.findMany({ where: { companyId: A } });
    expect(rows).toHaveLength(15);
    for (const s of data.scenarios) {
      const row = rows.find((r) => r.publicRef === refs.get(s.n))!;
      expect(row).toMatchObject({ status: 'NEW', source: 'PUBLIC_FORM', contactEmail: data.contactEmail, contactName: s.contactName, businessName: s.businessName, serviceRequested: s.service });
      expect(row.description).toContain(refTag(s.n));
      expect(row.title).toContain(s.businessName);
    }
  });

  it('duplicate handling: identical resubmission returns the original reference; same email + different text is a separate inquiry', async () => {
    const again = await http().post('/public/requests').send(payload(data.scenarios[0])).expect(201);
    expect(again.body.reference).toBe(refs.get(1));
    expect(await prisma.clientInquiry.count({ where: { companyId: A } })).toBe(15);
    expect(new Set((await prisma.clientInquiry.findMany({ where: { companyId: A } })).map((r) => r.contactEmail))).toEqual(new Set([data.contactEmail]));
  });

  it('CRM list shows all 15 (and survives reload); detail opens; status filter works; bad filter is 400', async () => {
    for (let reload = 0; reload < 2; reload++) {
      const res = await http().get('/inquiries').set(chairA()).expect(200);
      expect(res.body).toHaveLength(15);
      expect(res.body.map((r: any) => r.publicRef).sort()).toEqual([...refs.values()].sort());
    }
    const row = await rowOf(5);
    const detail = await http().get(`/inquiries/${row.id}`).set(chairA()).expect(200);
    expect(detail.body).toMatchObject({ businessName: 'AEVORA TEST B2B Services', contactEmail: data.contactEmail, status: 'NEW', serviceRequested: 'CRM' });
    expect((await http().get('/inquiries?status=NEW').set(chairA()).expect(200)).body).toHaveLength(15);
    expect((await http().get('/inquiries?status=QUALIFIED').set(chairA()).expect(200)).body).toHaveLength(0);
    await http().get('/inquiries?status=BOGUS').set(chairA()).expect(400);
    await http().get('/inquiries').set(empA()).expect(200); // staff can read
  });

  it('access control: anonymous 401; employee cannot transition or annotate (403); tenant B sees nothing and cannot touch A (404)', async () => {
    const row = await rowOf(1);
    await http().get('/inquiries').expect(401);
    await http().post(`/inquiries/${row.id}/transition`).send({ from: 'NEW', to: 'UNDER_REVIEW' }).expect(401);
    await http().post(`/inquiries/${row.id}/transition`).set(empA()).send({ from: 'NEW', to: 'UNDER_REVIEW' }).expect(403);
    await http().post(`/inquiries/${row.id}/notes`).set(empA()).send({ note: 'x' }).expect(403);
    expect((await http().get('/inquiries').set(mgrB()).expect(200)).body).toHaveLength(0);
    await http().get(`/inquiries/${row.id}`).set(mgrB()).expect(404);
    await http().post(`/inquiries/${row.id}/transition`).set(mgrB()).send({ from: 'NEW', to: 'UNDER_REVIEW' }).expect(404);
    await http().post(`/inquiries/${row.id}/notes`).set(mgrB()).send({ note: 'intrusion' }).expect(404);
    await http().get('/inquiries').set({ ...as({ actorId: chairmanId, actorRole: 'CHAIRMAN' }), 'x-company-id': 'not-my-company' }).expect(403);
    expect((await rowOf(1)).status).toBe('NEW');
    expect((await rowOf(1)).internalNotes ?? '').not.toContain('intrusion');
  });

  it('operator workflow: notes, permitted transitions only, illegal transitions rejected without changing data', async () => {
    for (const n of [...Array(15).keys()].map((i) => i + 1)) {
      expect((await move(n, 'NEW', 'UNDER_REVIEW')).status).toBe(201);
    }
    await http().post(`/inquiries/${(await rowOf(2)).id}/notes`).set(chairA()).send({ note: 'Called customer: wants a demo.' }).expect(201);
    expect((await http().get(`/inquiries/${(await rowOf(2)).id}`).set(chairA())).body.internalNotes).toContain('wants a demo');
    await http().post(`/inquiries/${(await rowOf(2)).id}/notes`).set(chairA()).send({ note: '' }).expect(400);
    // illegal: UNDER_REVIEW → CONVERTED, stale "from" (409), unknown status, missing body
    const r15 = await rowOf(15);
    expect((await move(15, 'UNDER_REVIEW', 'CONVERTED')).status).toBe(400);
    expect((await move(15, 'NEW', 'UNDER_REVIEW')).status).toBe(409); // already moved on
    expect((await move(15, 'UNDER_REVIEW', 'BOGUS')).status).toBe(400);
    await http().post(`/inquiries/${r15.id}/transition`).set(chairA()).send({}).expect(400);
    expect((await rowOf(15)).status).toBe('UNDER_REVIEW');
    // reject then reopen #14; leave #15 UNDER_REVIEW
    expect((await move(14, 'UNDER_REVIEW', 'REJECTED')).status).toBe(201);
    expect((await http().post('/public/requests/status').send({ reference: refs.get(14), email: data.contactEmail })).body.status).toBe('CLOSED');
    expect((await move(14, 'REJECTED', 'UNDER_REVIEW')).status).toBe(201);
    for (let n = 1; n <= 13; n++) expect((await move(n, 'UNDER_REVIEW', 'QUALIFIED')).status).toBe(201);
  });

  it('conversion: scenarios 1-13 each create exactly one client (with contact) and one linked opportunity', async () => {
    for (let n = 1; n <= 13; n++) {
      const res = await move(n, 'QUALIFIED', 'CONVERTED');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'CONVERTED' });
      expect(res.body.clientId).toBeTruthy();
      expect(res.body.opportunityId).toBeTruthy();
    }
    expect(await prisma.client.count({ where: { companyId: A } })).toBe(13); // 13 different businesses sharing one email stay separate
    expect(await prisma.opportunity.count({ where: { companyId: A } })).toBe(13);
    for (let n = 1; n <= 13; n++) {
      const row = await rowOf(n);
      const opp = await prisma.opportunity.findFirstOrThrow({ where: { inquiryId: row.id }, include: { client: { include: { contacts: true } } } });
      expect(opp).toMatchObject({ companyId: A, salesStage: 'NEW', clientId: row.clientId });
      expect(opp.client.name).toBe(data.scenarios[n - 1].businessName);
      expect(opp.client.contacts.map((c) => c.email)).toEqual([data.contactEmail]);
    }
  });

  it('repeat conversion is refused (terminal state) and creates no duplicate client/opportunity', async () => {
    for (const from of ['QUALIFIED', 'CONVERTED']) expect((await move(1, from, 'CONVERTED')).status).toBeGreaterThanOrEqual(400);
    expect((await move(1, 'CONVERTED', 'REJECTED')).status).toBe(400);
    expect(await prisma.client.count({ where: { companyId: A } })).toBe(13);
    expect(await prisma.opportunity.count({ where: { companyId: A } })).toBe(13);
    const audits = await prisma.customerAuditEvent.count({ where: { companyId: A, objectId: (await rowOf(1)).id, action: 'INQUIRY_STATUS_CHANGED' } });
    expect(audits).toBe(3);
  });

  it('repeat customer: a second request from the same business + email reuses its client and gets its own opportunity', async () => {
    const s = data.scenarios[0];
    const res = await http().post('/public/requests').send({ ...payload(s), description: `${s.description} Follow-up: also add an online fee payment page. [${refTag(1)}-REPEAT]` }).expect(201);
    refs.set(16, res.body.reference);
    expect((await move(16, 'NEW', 'UNDER_REVIEW')).status).toBe(201);
    expect((await move(16, 'UNDER_REVIEW', 'QUALIFIED')).status).toBe(201);
    const conv = await move(16, 'QUALIFIED', 'CONVERTED');
    expect(conv.status).toBe(201);
    expect(conv.body.clientId).toBe((await rowOf(1)).clientId);
    expect(await prisma.client.count({ where: { companyId: A } })).toBe(13);
    expect(await prisma.opportunity.count({ where: { companyId: A } })).toBe(14);
  });

  it('converted records are visible in the sales pipeline and tenant-scoped', async () => {
    const sales = new SalesOpportunityService(prisma, new SalesAuditService(prisma), {} as any);
    const list = await sales.listOpportunities(A);
    expect(list).toHaveLength(14);
    expect(list.every((o) => o.client && o.salesStage === 'NEW')).toBe(true);
    expect(list.map((o) => o.title).some((t) => t.includes('AEVORA TEST Gym'))).toBe(true);
    expect(await sales.listOpportunities(B)).toHaveLength(0);
    const [one] = list;
    await expect(sales.getOpportunity(B, one.id)).rejects.toBeTruthy();
    expect((await sales.getOpportunity(A, one.id)).inquiry?.contactEmail).toBe(data.contactEmail);
  });

  it('customer status lookup is coarse, needs the matching email, and leaks nothing', async () => {
    const ok = await http().post('/public/requests/status').send({ reference: refs.get(3), email: data.contactEmail.toUpperCase() }).expect(200);
    expect(ok.body.status).toBe('ACCEPTED');
    expect(Object.keys(ok.body).sort()).toEqual(['reference', 'status', 'submittedAt']);
    await http().post('/public/requests/status').send({ reference: refs.get(3), email: 'someone@else.test' }).expect(404);
    await http().post('/public/requests/status').send({ reference: 'REQ-AAAAAAAAAA', email: data.contactEmail }).expect(404);
    expect((await http().post('/public/requests/status').send({ reference: refs.get(15), email: data.contactEmail }).expect(200)).body.status).toBe('IN_REVIEW');
  });

  it('final state is consistent: 16 inquiries, status counts match, nothing was sent', async () => {
    const by = await prisma.clientInquiry.groupBy({ by: ['status'], where: { companyId: A }, _count: true });
    const counts = Object.fromEntries(by.map((g) => [g.status, g._count]));
    expect(counts).toEqual({ CONVERTED: 14, UNDER_REVIEW: 2 });
    expect(netFetch).not.toHaveBeenCalled();
  });
});
