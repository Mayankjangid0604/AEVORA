import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionEnvironment } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ROLES_KEY } from '../authorization/roles.guard';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { SandboxEmailProvider } from './providers/sandbox-email.provider';

/** Any attempt to reach a real transport fails the test. */
const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK SEND ATTEMPTED'); });
const smtp = jest.fn((..._a: any[]) => { throw new Error('SMTP TRANSPORT ATTEMPTED'); });
jest.mock('nodemailer', () => ({ createTransport: (...a: any[]) => smtp(...a) }));

describe('Outbound gate (P0-1/2/3): one policy for every email', () => {
  const approvedDraft = { id: 'd1', companyId: 'c1', status: 'SENDING', approvedBy: 'chair', approvedAt: new Date(), recipientEmail: 'Owner@Shop.test', subject: 'S', messageBody: 'B' };
  let prisma: any;
  let production: any;
  let sandbox: SandboxEmailProvider;
  let svc: IntegrationService;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.OUTREACH_ENVIRONMENT = 'SANDBOX';
    process.env.ENABLE_REAL_PRODUCTION_SENDING = 'false';
    prisma = {
      killSwitchConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      outreachDraft: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(approvedDraft),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'new-draft', ...data })),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      outreachResponse: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSuppression: { findUnique: jest.fn().mockResolvedValue(null) },
      salesLead: { findFirst: jest.fn().mockResolvedValue(null) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findUnique: jest.fn().mockResolvedValue(null) },
      integrationAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a1' }), update: jest.fn().mockResolvedValue({}) },
      providerIntegration: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    production = { send: jest.fn().mockRejectedValue(new Error('PRODUCTION PROVIDER CALLED')) };
    sandbox = new SandboxEmailProvider();
    jest.spyOn(sandbox, 'send');
    svc = new IntegrationService(prisma, sandbox, production, { log: jest.fn() } as any);
  });
  afterEach(() => { process.env = { ...env }; });
  afterAll(() => {
    expect(netFetch).not.toHaveBeenCalled();
    expect(smtp).not.toHaveBeenCalled();
  });

  const payload = { to: 'owner@shop.test', subject: 'S', body: 'B' };

  it('without approval nothing is sent: a PENDING_APPROVAL draft is queued', async () => {
    const r = await svc.sendEmail('c1', ExecutionEnvironment.PRODUCTION, payload);
    expect(r).toMatchObject({ success: false, pendingApproval: true, draftId: 'new-draft' });
    expect(prisma.outreachDraft.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', companyId: 'c1' }) }));
    expect(sandbox.send).not.toHaveBeenCalled();
    expect(production.send).not.toHaveBeenCalled();
  });

  it('worker retries of the same message reuse one draft', async () => {
    prisma.outreachDraft.findUnique.mockResolvedValue({ id: 'existing' });
    expect((await svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, payload)).draftId).toBe('existing');
    expect(prisma.outreachDraft.create).not.toHaveBeenCalled();
  });

  it.each([
    ['not in SENDING', { status: 'PENDING_APPROVAL' }],
    ['never approved', { approvedBy: null }],
    ['other recipient', { recipientEmail: 'someone@else.test' }],
    ['edited after approval', { messageBody: 'different' }],
  ])('rejects an approval whose draft is %s', async (_n, patch) => {
    prisma.outreachDraft.findFirst.mockResolvedValue({ ...approvedDraft, ...patch });
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, payload, 'chair', { draftId: 'd1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(sandbox.send).not.toHaveBeenCalled();
  });

  it('approval is tenant-scoped (draft lookup includes companyId)', async () => {
    prisma.outreachDraft.findFirst.mockResolvedValue(null);
    await expect(svc.sendEmail('c2', ExecutionEnvironment.SANDBOX, payload, 'x', { draftId: 'd1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.outreachDraft.findFirst).toHaveBeenCalledWith({ where: { id: 'd1', companyId: 'c2' } });
  });

  it('a client cannot select PRODUCTION: approved send stays on the sandbox provider', async () => {
    const r = await svc.sendEmail('c1', ExecutionEnvironment.PRODUCTION, payload, 'chair', { draftId: 'd1' });
    expect(r.success).toBe(true);
    expect(sandbox.send).toHaveBeenCalled();
    expect(production.send).not.toHaveBeenCalled();
  });

  it('kill switch blocks, and a failing kill-switch lookup fails closed', async () => {
    prisma.killSwitchConfig.findFirst.mockResolvedValueOnce({ feature: 'OUTBOUND_EMAIL' });
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, payload, 'chair', { draftId: 'd1' })).rejects.toBeInstanceOf(ForbiddenException);
    prisma.killSwitchConfig.findFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, payload, 'chair', { draftId: 'd1' })).rejects.toThrow('db down');
    expect(sandbox.send).not.toHaveBeenCalled();
  });

  it('suppressed recipients are blocked even with an approval, and are not even drafted', async () => {
    prisma.salesLead.findFirst.mockResolvedValue({ id: 'disq' });
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, payload, 'chair', { draftId: 'd1' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, payload)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.outreachDraft.create).not.toHaveBeenCalled();
  });

  it('sendWithApprover rejects non-management and cross-tenant actors', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'e', companyId: 'c1', status: 'ACTIVE', role: { accessLevel: 'STANDARD' } });
    await expect(svc.sendWithApprover('c1', 'e', payload)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.employee.findUnique.mockResolvedValue({ id: 'e', companyId: 'OTHER', status: 'ACTIVE', role: { accessLevel: 'MANAGEMENT' } });
    await expect(svc.sendWithApprover('c1', 'e', payload)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.outreachDraft.create).not.toHaveBeenCalled();
  });

  it('POST /integration/email: management only, tenant + environment from the server, only queues', async () => {
    expect(new Reflector().get(ROLES_KEY, IntegrationController)).toEqual(['CHAIRMAN', 'MANAGEMENT']);
    const c = new IntegrationController(svc);
    const r = await c.sendEmail({ to: 'x@y.test', subject: 'S', emailBody: 'B', environment: 'PRODUCTION', companyId: 'evil' }, { user: { companyId: 'c1', actorId: 'chair' } });
    expect(r.pendingApproval).toBe(true);
    expect(prisma.outreachDraft.create.mock.calls[0][0].data.companyId).toBe('c1');
    expect(sandbox.send).not.toHaveBeenCalled();
  });
});

/** Source conformance: the only things that may hand mail to a transport are the gate and the internal Chairman mailer. */
describe('Send-path conformance', () => {
  const root = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && files.push(path.join(d, e.name)));
  walk(root);
  walk(path.join(root, '..', 'scripts'));
  const rel = (f: string) => path.relative(path.join(root, '..'), f).replace(/\\/g, '/');
  const grep = (re: RegExp) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();

  it('raw transports exist only in the provider and the internal Chairman mailer', () => {
    expect(grep(/createTransport\(|sendgrid\.com|graph\.facebook\.com|api\.twilio\.com/)).toEqual([
      'src/integration/providers/production-email.provider.ts',
      'src/notifications/chairman-mailer.ts',
    ]);
  });

  it('Vercel publishing exists only in DemoFactoryService, and both entry points assert the outbound policy', () => {
    expect(grep(/api\.vercel\.com/)).toEqual(['src/sales-outreach/demo-factory.service.ts']);
    const src = fs.readFileSync(path.join(root, 'sales-outreach/demo-factory.service.ts'), 'utf8');
    expect(src.indexOf('assertPublishingAllowed(this.prisma, lead.companyId)')).toBeLessThan(src.indexOf('/v10/projects'));
    expect(src.indexOf("assertOutboundAllowed(this.prisma, site.companyId, 'PUBLISH')")).toBeLessThan(src.indexOf("method: 'DELETE'"));
  });

  it('only the gate and OutreachService pass an approval to sendEmail; sendWithApprover is operator-only', () => {
    expect(grep(/\{\s*draftId(\s*:\s*[\w.]+)?\s*\}\s*,?\s*\)/)).toEqual(['src/integration/integration.service.ts', 'src/outreach/outreach.service.ts']);
    expect(grep(/\.sendWithApprover\(/)).toEqual(['src/sales-outreach/client-meeting.controller.ts', 'src/sales-outreach/inbound-message.service.ts']);
  });

  it('inbound replies only use sendWithApprover when an authenticated approver is passed', () => {
    const src = fs.readFileSync(path.join(root, 'sales-outreach/inbound-message.service.ts'), 'utf8');
    expect(src).toMatch(/approverId\s*\n?\s*\?\s*await this\.integration\.sendWithApprover/);
    expect(src.match(/this\.sendReply\(companyId, messageId, c\.draftReply\)/g)?.length).toBeGreaterThan(0); // automated: no approver
    expect(src).not.toMatch(/this\.sendReply\([^)]*,[^)]*,[^)]*,[^)]*\)/); // no automated call passes an approver
  });
});
