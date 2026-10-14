/**
 * P0-1 regression on a REAL disposable Postgres (:5444 only): the automated sales cycle (what both the
 * SALES_AUTO_PROCESS cron and the business-loop tick call) may draft but never send. Approval sends exactly once.
 * Run: E2E_DB=1 DATABASE_URL=postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e npx jest autonomous-outreach.e2e
 */
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { SandboxEmailProvider } from '../integration/providers/sandbox-email.provider';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { OutreachService } from '../outreach/outreach.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { EmailOutreachService } from './email-outreach.service';
import { PhoneOutreachService } from './phone-outreach.service';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';
import { SalesAgentWorker } from './sales-agent.worker';

jest.mock('@aevora/model-gateway', () => ({
  ModelGateway: jest.fn().mockImplementation(() => ({ generate: jest.fn().mockResolvedValue({ text: '' }) })),
}));

const run = process.env.E2E_DB === '1' && /:(5444)\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

run('Automated outreach cannot send without approval (real DB)', () => {
  jest.setTimeout(60_000);
  const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK SEND ATTEMPTED'); });
  const prisma = new PrismaService();
  const sandbox = new SandboxEmailProvider();
  const sandboxSend = jest.spyOn(sandbox, 'send');
  const production = { send: jest.fn().mockRejectedValue(new Error('PRODUCTION PROVIDER CALLED')) };
  const logger = new StructuredLoggerService();
  const integration = new IntegrationService(prisma, sandbox, production as any, logger);
  const realtime = { broadcastToUser: jest.fn() } as any;
  const demo = { createDemoForLead: jest.fn().mockResolvedValue(null) } as any; // no Vercel
  const email = new EmailOutreachService(prisma, integration, demo);
  const worker = new SalesAgentWorker(prisma, new LeadGenService(prisma, {} as any, realtime), email,
    new PhoneOutreachService(prisma, realtime), new WhatsAppOutreachService(prisma, realtime, demo), realtime);
  const outreach = new OutreachService(prisma, integration, logger);
  const tag = `e2e-auto-${Date.now()}`;
  let companyId: string;
  let chairmanId: string;

  beforeAll(async () => {
    if (process.env.SMTP_HOST || process.env.SENDGRID_API_KEY || process.env.OUTREACH_ENVIRONMENT !== 'SANDBOX') throw new Error('refusing to run: real mail transport configured');
    process.env.SALES_AUTO_PROCESS = 'true'; // must not matter
    process.env.OUTREACH_RATE_LIMIT_MINUTES = '1';
    const chairman = await prisma.chairman.findFirstOrThrow();
    chairmanId = chairman.id;
    const company = await prisma.company.create({ data: { name: tag, chairmanId } });
    companyId = company.id;
    const dept = await prisma.department.create({ data: { name: 'Sales', companyId } });
    const role = await prisma.role.create({ data: { title: `${tag} Sales Executive` } as any });
    await prisma.employee.create({ data: { name: 'Nova', identitySeed: tag, companyId, departmentId: dept.id, roleId: role.id, status: 'ACTIVE' } as any });
    await prisma.salesLead.create({ data: { companyId, name: 'Auto Cafe', contactEmail: 'owner@autocafe.test', googlePlaceId: `${tag}-1`, qualityScore: 90 } });
    await prisma.salesLead.create({ data: { companyId, name: 'Phone Only Shop', contactPhone: '+91 90000 00000', googlePlaceId: `${tag}-2`, qualityScore: 80 } });
  });

  afterAll(async () => {
    const leads = await prisma.salesLead.findMany({ where: { companyId }, select: { id: true } });
    await prisma.leadGenAudit.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
    await prisma.outreachCampaign.deleteMany({ where: { companyId } });
    await prisma.outreachDraft.deleteMany({ where: { companyId } });
    await prisma.integrationAuditLog.deleteMany({ where: { companyId } });
    await prisma.salesLead.deleteMany({ where: { companyId } });
    await prisma.employee.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } }).catch((e) => console.warn(`left behind: ${e.message}`));
    await prisma.role.deleteMany({ where: { title: { startsWith: tag } } });
    await prisma.$disconnect();
    expect(netFetch).not.toHaveBeenCalled();
    expect(production.send).not.toHaveBeenCalled();
  });

  it('cron / business-loop cycle drafts the cold email but sends nothing', async () => {
    await worker.processQueue(companyId);
    const drafts = await prisma.outreachDraft.findMany({ where: { companyId } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ status: 'PENDING_APPROVAL', recipientEmail: 'owner@autocafe.test', approvedBy: null });
    const campaign = await prisma.outreachCampaign.findFirstOrThrow({ where: { companyId, channel: 'EMAIL' } });
    expect(campaign.status).toBe('SCHEDULED');
    expect(campaign.notes).toContain(`Awaiting human approval: OutreachDraft ${drafts[0].id}`);
    expect(sandboxSend).not.toHaveBeenCalled();
    expect(await prisma.integrationAuditLog.count({ where: { companyId } })).toBe(0);
  });

  it('worker retries and repeated cycles do not create duplicate drafts or sends', async () => {
    const lead = await prisma.salesLead.findFirstOrThrow({ where: { companyId, name: 'Auto Cafe' } });
    await email.sendOutreachEmail(companyId, lead, undefined).catch(() => undefined);
    await worker.processQueue(companyId);
    expect(await prisma.outreachDraft.count({ where: { companyId } })).toBe(1);
    expect(sandboxSend).not.toHaveBeenCalled();
  });

  it('WhatsApp leads are only pushed to the Chairman for manual send', async () => {
    await prisma.outreachCampaign.updateMany({ where: { companyId }, data: { createdAt: new Date(0) } }); // past rate window
    await worker.processQueue(companyId);
    const wa = await prisma.outreachCampaign.findFirst({ where: { companyId, channel: 'WHATSAPP' } });
    if (wa) expect(wa).toMatchObject({ status: 'SCHEDULED', sentAt: null });
    expect(netFetch).not.toHaveBeenCalled();
  });

  it('approval sends exactly once (concurrent approvals), through the sandbox only', async () => {
    const draft = await prisma.outreachDraft.findFirstOrThrow({ where: { companyId } });
    const results = await Promise.allSettled([1, 2, 3].map(() => outreach.approveAndSend(companyId, chairmanId, draft.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(sandboxSend).toHaveBeenCalledTimes(1);
    expect((await prisma.outreachDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('SENT');
  });

  it('a disqualified (opted-out) lead is refused even for a fresh automated attempt', async () => {
    await prisma.salesLead.updateMany({ where: { companyId, name: 'Auto Cafe' }, data: { status: 'DISQUALIFIED' } });
    await expect(integration.sendEmail(companyId, 'PRODUCTION' as any, { to: 'OWNER@autocafe.test', subject: 'x', body: 'y' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(sandboxSend).toHaveBeenCalledTimes(1);
  });
});
