/**
 * Journeys B, D, F, H against a REAL disposable Postgres (never the protected dev DB on 5433).
 * Run: E2E_DB=1 DATABASE_URL=postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e npx jest revenue-loop.e2e
 * Email transport is the SandboxEmailProvider (logs only) — this is NOT a real-provider test.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { SandboxEmailProvider } from '../integration/providers/sandbox-email.provider';
import { ProductionEmailProvider } from '../integration/providers/production-email.provider';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { OutreachService } from '../outreach/outreach.service';
import { LeadGenService } from './lead-gen.service';

const run = process.env.E2E_DB === '1' && /:(5444)\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

run('Revenue loop on real DB (sandbox transport)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaService();
  const logger = new StructuredLoggerService();
  const integration = new IntegrationService(prisma, new SandboxEmailProvider(), new ProductionEmailProvider(), logger);
  const outreach = new OutreachService(prisma, integration, logger);
  const leadGen = new LeadGenService(prisma, {} as any, { broadcastToUser: () => undefined } as any);
  const tag = `e2e-${Date.now()}`;
  const ids: { companies: string[] } = { companies: [] };
  let A: { companyId: string; chairmanEmp: string; staffEmp: string };
  let B: { companyId: string; chairmanEmp: string };

  async function tenant(label: string) {
    const chairman = await prisma.chairman.findFirstOrThrow();
    const company = await prisma.company.create({ data: { name: `${tag}-${label}`, chairmanId: chairman.id } });
    ids.companies.push(company.id);
    const dept = await prisma.department.create({ data: { name: 'Sales', companyId: company.id } });
    const boss = await prisma.role.create({ data: { title: `${tag}-boss`, accessLevel: 'CHAIRMAN' } as any });
    const staff = await prisma.role.create({ data: { title: `${tag}-staff`, accessLevel: 'STANDARD' } as any });
    const emp = (roleId: string, n: string) =>
      prisma.employee.create({ data: { name: n, identitySeed: `${tag}-${n}`, companyId: company.id, departmentId: dept.id, roleId, status: 'ACTIVE' } as any });
    return { companyId: company.id, chairmanEmp: (await emp(boss.id, `${label}-boss`)).id, staffEmp: (await emp(staff.id, `${label}-staff`)).id };
  }

  beforeAll(async () => {
    // Hard stop if anything could reach a real transport.
    if (process.env.SMTP_HOST || process.env.SENDGRID_API_KEY || process.env.OUTREACH_ENVIRONMENT !== 'SANDBOX') throw new Error('refusing to run: real mail transport configured');
    process.env.TEST_EMAIL_RECIPIENT = 'sink@example.test';
    A = await tenant('A');
    B = await tenant('B');
  }, 60_000);

  afterAll(async () => {
    // Clean up only rows this run created.
    for (const companyId of ids.companies) {
      const leads = await prisma.salesLead.findMany({ where: { companyId }, select: { id: true } });
      await prisma.leadGenAudit.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
      await prisma.outreachResponse.deleteMany({ where: { companyId } });
      await prisma.outreachDraft.deleteMany({ where: { companyId } });
      await prisma.salesLead.deleteMany({ where: { companyId } });
      await prisma.$executeRawUnsafe(`DELETE FROM "IntegrationAuditLog" WHERE "companyId" = $1`, companyId).catch(() => undefined);
      await prisma.employee.deleteMany({ where: { companyId } });
      await prisma.department.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch((e) => console.warn(`company ${companyId} left behind: ${e.message}`));
    }
    await prisma.role.deleteMany({ where: { title: { startsWith: tag } } }).catch(() => undefined);
    await prisma.$disconnect();
  }, 60_000);

  it('B: imports, normalizes, dedups, scores with explanation, persists', async () => {
    const rows = [
      { businessName: 'Sharma Sweets', phone: '+91 1', email: 'owner@sharma.test', location: 'Jaipur, India', category: 'restaurant' },
      { businessName: 'Pixel Gym', website: 'https://www.pixelgym.test/home', location: 'Pune, India' },
      { businessName: 'Pixel Gym (dup by website)', website: 'pixelgym.test' },
      { businessName: '' },
      { businessName: 'Bad Mail', email: 'not-an-email' },
    ];
    const r1 = await leadGen.importLeads(A.companyId, rows, 'operator-test-list');
    expect(r1).toMatchObject({ created: 2, duplicates: 1 });
    expect(r1.invalid.map((i) => i.index)).toEqual([3, 4]);
    const r2 = await leadGen.importLeads(A.companyId, rows, 'operator-test-list');
    expect(r2).toMatchObject({ created: 0, duplicates: 3 });

    const sharma = await prisma.salesLead.findFirstOrThrow({ where: { companyId: A.companyId, name: 'Sharma Sweets' } });
    expect(sharma.qualityScore).toBe(80); // phone 25 + email 25 + no website 30
    expect((sharma.metadata as any).scoreFactors).toEqual({ hasPhone: 25, hasEmail: 25, noWebsite: 30, reviews: 0 });
    expect((sharma.metadata as any).importSource).toBe('operator-test-list');
    expect((await leadGen.listQueue(A.companyId)).map((l) => l.name)[0]).toBe('Sharma Sweets');
  });

  it('D: draft → approval gate → sandbox send → no double send → suppression', async () => {
    const lead = await prisma.salesLead.findFirstOrThrow({ where: { companyId: A.companyId, name: 'Sharma Sweets' } });
    const draft = await outreach.createDraft(A.companyId, A.chairmanEmp, { recipientEmail: lead.contactEmail!, subject: 'Hi', messageBody: 'Truthful pitch', salesLeadId: lead.id });
    expect(draft.status).toBe('PENDING_APPROVAL');

    await expect(outreach.approveAndSend(A.companyId, A.staffEmp, draft.id)).rejects.toBeInstanceOf(ForbiddenException);
    const res = await outreach.approveAndSend(A.companyId, A.chairmanEmp, draft.id);
    expect(res.response).toMatchObject({ success: true, actualRecipient: lead.contactEmail, referenceId: expect.stringMatching(/^sandbox-email-/) }); // SANDBOX: logged, not delivered
    const sent = await prisma.outreachDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(sent).toMatchObject({ status: 'SENT', approvedBy: A.chairmanEmp });
    await expect(outreach.approveAndSend(A.companyId, A.chairmanEmp, draft.id)).rejects.toThrow(); // already SENT

    // Concurrent approvals of a fresh draft: exactly one wins.
    const d2 = await outreach.createDraft(A.companyId, A.chairmanEmp, { recipientEmail: 'race@pixelgym.test', subject: 'x', messageBody: 'y' });
    const results = await Promise.allSettled([1, 2, 3].map(() => outreach.approveAndSend(A.companyId, A.chairmanEmp, d2.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.some((r) => r.status === 'rejected' && r.reason instanceof ConflictException)).toBe(true);

    await prisma.outreachResponse.create({ data: { companyId: A.companyId, draftId: draft.id, responseType: 'UNSUBSCRIBED' } });
    const d3 = await outreach.createDraft(A.companyId, A.chairmanEmp, { recipientEmail: 'OWNER@sharma.test', subject: 'again', messageBody: 'z' });
    await expect(outreach.approveAndSend(A.companyId, A.chairmanEmp, d3.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await prisma.outreachDraft.findUniqueOrThrow({ where: { id: d3.id } })).status).toBe('FAILED');
  });

  it('F: tenant B cannot operate on tenant A data', async () => {
    const aDraft = await prisma.outreachDraft.findFirstOrThrow({ where: { companyId: A.companyId } });
    await expect(outreach.approveAndSend(B.companyId, B.chairmanEmp, aDraft.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(outreach.approveAndSend(A.companyId, B.chairmanEmp, aDraft.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await outreach.getDrafts(B.companyId)).toHaveLength(0);
    expect(await leadGen.listLeads(B.companyId)).toHaveLength(0);
    // Same business imported by B is a separate lead (dedup is per tenant).
    expect((await leadGen.importLeads(B.companyId, [{ businessName: 'Pixel Gym', website: 'pixelgym.test' }], 'b-list')).created).toBe(1);
  });

  it('H: funnel reconciles with persisted rows', async () => {
    const leads = await prisma.salesLead.findMany({ where: { companyId: A.companyId } });
    await prisma.salesLead.update({ where: { id: leads[0].id }, data: { status: 'CONVERTED' } });
    await prisma.salesLead.update({ where: { id: leads[1].id }, data: { status: 'QUALIFIED' } });
    const f = await leadGen.funnel(A.companyId);
    expect(f.leads).toEqual({ total: 2, CONVERTED: 1, QUALIFIED: 1 });
    expect(f.conversionRate).toBe(0.5);
    expect(f.drafts).toEqual({ SENT: 2, FAILED: 1 });
    expect(f.responses).toEqual({ UNSUBSCRIBED: 1 });
    expect((await leadGen.funnel(B.companyId)).leads.total).toBe(1);
  });
});
