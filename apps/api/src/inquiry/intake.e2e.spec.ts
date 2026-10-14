/**
 * Gate 4A DB journey (synthetic data, disposable Postgres :5444 ONLY): public submission → operator queue →
 * status transitions → notes → customer status lookup, plus tenant isolation and job pause/resume/replay.
 * Run via scripts/verify-disposable-db.sh (it applies the Gate 3/4A migrations to the disposable DB first).
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobService } from '../job/job.service';
import { InquiryService } from './inquiry.service';
import { validateIntake } from './intake';

const run = process.env.E2E_DB === '1' && /:(5444)\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

run('Customer intake → operator queue (real disposable DB)', () => {
  jest.setTimeout(60_000);
  const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK CALL ATTEMPTED'); });
  const prisma = new PrismaService();
  const inquiries = new InquiryService(prisma);
  const jobs = new JobService(prisma, {} as any, { log: () => undefined } as any);
  const tag = `e2e-intake-${Date.now()}`;
  const companies: string[] = [];
  let A: string;
  let B: string;
  const chair = { actorId: 'e2e-chair', actorType: 'CHAIRMAN' };
  const form = (n: number) => (validateIntake({ businessName: `Synthetic Cafe ${n}`, contactName: 'Test Person', email: `owner${n}@${tag}.test`, service: 'WEBSITE', description: 'Synthetic test request: we need a website with a menu page.' }) as any).value;

  beforeAll(async () => {
    const chairman = await prisma.chairman.findFirstOrThrow();
    for (const label of ['A', 'B']) companies.push((await prisma.company.create({ data: { name: `${tag}-${label}`, chairmanId: chairman.id } })).id);
    [A, B] = companies;
    process.env.PUBLIC_INTAKE_COMPANY_ID = A;
  });

  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.customerAuditEvent.deleteMany({ where: { companyId } });
      await prisma.managementAuditEvent.deleteMany({ where: { companyId } });
      await prisma.backgroundJob.deleteMany({ where: { companyId } });
      await prisma.clientInquiry.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch((e) => console.warn(`left behind: ${e.message}`));
    }
    await prisma.$disconnect();
    expect(netFetch).not.toHaveBeenCalled();
  });

  it('submission persists once (duplicate returns the same reference) and nothing is sent', async () => {
    const r1 = await inquiries.submitPublic(form(1));
    const r2 = await inquiries.submitPublic(form(1));
    expect(r2.reference).toBe(r1.reference);
    const rows = await prisma.clientInquiry.findMany({ where: { companyId: A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'NEW', source: 'PUBLIC_FORM', publicRef: r1.reference, contactEmail: `owner1@${tag}.test` });
    expect(await prisma.customerAuditEvent.count({ where: { companyId: A, action: 'INQUIRY_SUBMITTED' } })).toBe(1);
  });

  it('operator processes it: review → qualify → convert, with notes; concurrent duplicate loses with 409', async () => {
    const [row] = await inquiries.list(A, 'NEW');
    await inquiries.transition(A, chair, row.id, 'NEW', 'UNDER_REVIEW');
    const race = await Promise.allSettled([1, 2].map(() => inquiries.transition(A, chair, row.id, 'UNDER_REVIEW', 'QUALIFIED')));
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(race.some((r) => r.status === 'rejected' && r.reason instanceof ConflictException)).toBe(true);
    await Promise.all(['first note', 'second note'].map((n) => inquiries.addNote(A, chair, row.id, n))); // concurrent appends
    const after = await inquiries.transition(A, chair, row.id, 'QUALIFIED', 'CONVERTED');
    expect(after.status).toBe('CONVERTED');
    expect(after.internalNotes).toContain('first note');
    expect(after.internalNotes).toContain('second note');
    expect(await prisma.customerAuditEvent.count({ where: { companyId: A, objectId: row.id, action: 'INQUIRY_STATUS_CHANGED' } })).toBe(3);
  });

  it('customer status lookup shows a coarse status only, and needs the matching email', async () => {
    const row = await prisma.clientInquiry.findFirstOrThrow({ where: { companyId: A } });
    const s = await inquiries.publicStatus(row.publicRef, `OWNER1@${tag}.test`);
    expect(s).toEqual({ reference: row.publicRef, status: 'ACCEPTED', submittedAt: row.receivedAt });
    await expect(inquiries.publicStatus(row.publicRef, 'someone@else.test')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenant B cannot list, read, transition or annotate tenant A requests', async () => {
    const row = await prisma.clientInquiry.findFirstOrThrow({ where: { companyId: A } });
    expect(await inquiries.list(B)).toHaveLength(0);
    await expect(inquiries.get(B, row.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(inquiries.transition(B, chair, row.id, 'CONVERTED', 'REJECTED')).rejects.toBeTruthy();
    await expect(inquiries.addNote(B, chair, row.id, 'intrusion')).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.clientInquiry.findUniqueOrThrow({ where: { id: row.id } })).internalNotes).not.toContain('intrusion');
  });

  it('job controls on real rows: pause/resume, replay a failed job, tenant-scoped', async () => {
    const job = await prisma.backgroundJob.create({ data: { companyId: A, type: 'TASK_EXECUTION', payload: {}, idempotencyKey: `${A}:${tag}-job` } });
    expect((await jobs.controlJob(A, 'chair', job.id, 'pause')).status).toBe('PAUSED');
    await expect(jobs.controlJob(B, 'chair', job.id, 'resume')).rejects.toBeInstanceOf(NotFoundException);
    expect((await jobs.controlJob(A, 'chair', job.id, 'resume')).status).toBe('QUEUED');
    await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: 'FAILED', attempts: 3, lastError: 'synthetic failure' } });
    const replayed = await jobs.controlJob(A, 'chair', job.id, 'replay');
    expect(replayed).toMatchObject({ status: 'QUEUED', attempts: 0 });
    expect(await prisma.managementAuditEvent.count({ where: { companyId: A, objectId: job.id } })).toBe(3);
  });
});
