import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExecutionEnvironment } from '@prisma/client';
import {
  assertOutboundAllowed, assertPublishingAllowed, assertWithinSendLimits, emergencyStopActive,
  signUnsubscribeToken, verifyUnsubscribeToken,
} from '../common/outbound-policy';
import { DemoFactoryService } from '../sales-outreach/demo-factory.service';
import { WhatsAppOutreachService } from '../sales-outreach/whatsapp-outreach.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { IntegrationService } from './integration.service';
import { SandboxEmailProvider } from './providers/sandbox-email.provider';
import { UnsubscribeController } from './unsubscribe.controller';

/** Any real network or SMTP attempt fails the suite. */
const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK CALL ATTEMPTED'); });
const smtp = jest.fn((..._a: any[]) => { throw new Error('SMTP TRANSPORT ATTEMPTED'); });
jest.mock('nodemailer', () => ({ createTransport: (...a: any[]) => smtp(...a) }));
afterAll(() => {
  expect(netFetch).not.toHaveBeenCalled();
  expect(smtp).not.toHaveBeenCalled();
});

/** In-memory EmailSuppression + the other tables the gate reads. */
function fakePrisma() {
  const suppressions = new Map<string, any>();
  const key = (w: any) => `${w.companyId_email.companyId}|${w.companyId_email.email}`;
  return {
    suppressions,
    emailSuppression: {
      findUnique: jest.fn(async ({ where }) => suppressions.get(key(where)) ?? null),
      upsert: jest.fn(async ({ where, create }) => {
        if (!suppressions.has(key(where))) suppressions.set(key(where), { id: `s${suppressions.size}`, ...create });
        return suppressions.get(key(where));
      }),
    },
    killSwitchConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    outreachDraft: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'queued', ...data })),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    outreachResponse: { findFirst: jest.fn().mockResolvedValue(null) },
    salesLead: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 'lead', ...data })) },
    integrationAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a' }), update: jest.fn() },
    providerIntegration: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;
}

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe('Unsubscribe tokens and endpoint (P0-7)', () => {
  it('round-trips a signed token; rejects tampered, foreign, malformed tokens', () => {
    const t = signUnsubscribeToken('c1', ' Owner@Shop.TEST ');
    expect(verifyUnsubscribeToken(t)).toEqual({ companyId: 'c1', email: 'owner@shop.test' });
    const [data, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify(['c2', 'owner@shop.test'])).toString('base64url');
    expect(verifyUnsubscribeToken(`${forged}.${sig}`)).toBeNull(); // another tenant, same signature
    expect(verifyUnsubscribeToken(`${data}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyUnsubscribeToken(`${data}.${sig}.extra`)).toBeNull();
    for (const bad of [undefined, '', 'abc', 'x'.repeat(5000), 42]) expect(verifyUnsubscribeToken(bad)).toBeNull();
    process.env.UNSUBSCRIBE_SECRET = 'a-different-secret-that-is-long-enough-0000';
    expect(verifyUnsubscribeToken(t)).toBeNull(); // secret rotation invalidates
  });

  it('refuses to issue tokens without a strong secret', () => {
    process.env.UNSUBSCRIBE_SECRET = 'short';
    expect(() => signUnsubscribeToken('c1', 'a@b.test')).toThrow(ForbiddenException);
  });

  it('GET only confirms (no write); POST records once, idempotently; invalid token writes nothing', async () => {
    const prisma = fakePrisma();
    const c = new UnsubscribeController(prisma);
    const t = signUnsubscribeToken('c1', 'owner@shop.test');
    expect(c.confirm(t)).toContain('owner@shop.test');
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
    await c.unsubscribe(t);
    await c.unsubscribe(t);
    expect(prisma.suppressions.size).toBe(1);
    expect([...prisma.suppressions.values()][0]).toMatchObject({ companyId: 'c1', email: 'owner@shop.test', reason: 'UNSUBSCRIBE_LINK' });
    expect(() => c.confirm('forged.token')).toThrow(BadRequestException);
    await expect(c.unsubscribe('forged.token')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.suppressions.size).toBe(1);
  });

  it('escapes the address in the confirmation page', () => {
    const c = new UnsubscribeController(fakePrisma());
    expect(c.confirm(signUnsubscribeToken('c1', '<script>@x.test'))).not.toContain('<script>@');
  });
});

describe('Gate: unsubscribe link + headers, opt-out enforcement', () => {
  const approved = (to: string) => ({ id: 'd1', companyId: 'c1', status: 'SENDING', approvedBy: 'chair', approvedAt: new Date(), recipientEmail: to, subject: 'S', messageBody: 'B' });

  it('every sent email carries the signed link and RFC 8058 headers for the intended recipient', async () => {
    const prisma = fakePrisma();
    prisma.outreachDraft.findFirst.mockResolvedValue(approved('owner@shop.test'));
    const sandbox = new SandboxEmailProvider();
    const send = jest.spyOn(sandbox, 'send');
    await new IntegrationService(prisma, sandbox, {} as any, { log: jest.fn() } as any)
      .sendEmail('c1', ExecutionEnvironment.SANDBOX, { to: 'owner@shop.test', subject: 'S', body: 'B' }, 'chair', { draftId: 'd1' });
    const sent = send.mock.calls[0][0];
    const url = sent.headers!['List-Unsubscribe'].slice(1, -1);
    expect(sent.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent.body).toContain(`Unsubscribe: ${url}`);
    expect(url.startsWith('http://localhost:4011/unsubscribe?t=')).toBe(true);
    expect(verifyUnsubscribeToken(decodeURIComponent(url.split('t=')[1]))).toEqual({ companyId: 'c1', email: 'owner@shop.test' });
  });

  it('after opt-out: approved sends, automated drafts and retries are all refused', async () => {
    const prisma = fakePrisma();
    await new UnsubscribeController(prisma).unsubscribe(signUnsubscribeToken('c1', 'owner@shop.test'));
    prisma.outreachDraft.findFirst.mockResolvedValue(approved('OWNER@shop.test'));
    const sandbox = { send: jest.fn() };
    const svc = new IntegrationService(prisma, sandbox as any, {} as any, { log: jest.fn() } as any);
    const p = { to: 'OWNER@shop.test', subject: 'S', body: 'B' };
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, p, 'chair', { draftId: 'd1' })).rejects.toThrow('suppressed');
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, p)).rejects.toThrow('suppressed');
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, { ...p, correlationId: 'retry-1' })).rejects.toThrow('suppressed');
    expect(sandbox.send).not.toHaveBeenCalled();
    expect(prisma.outreachDraft.create).not.toHaveBeenCalled();
  });

  it('opt-out is per tenant: another company may still email the same address (it never opted out of them)', async () => {
    const prisma = fakePrisma();
    await new UnsubscribeController(prisma).unsubscribe(signUnsubscribeToken('c1', 'owner@shop.test'));
    const svc = new IntegrationService(prisma, { send: jest.fn() } as any, {} as any, { log: jest.fn() } as any);
    expect((await svc.sendEmail('c2', ExecutionEnvironment.SANDBOX, { to: 'owner@shop.test', subject: 'S', body: 'B' })).pendingApproval).toBe(true);
  });

  it('lead import cannot re-activate an opted-out address', async () => {
    const prisma = fakePrisma();
    await new UnsubscribeController(prisma).unsubscribe(signUnsubscribeToken('c1', 'owner@shop.test'));
    const r = await new LeadGenService(prisma, {} as any, {} as any).importLeads('c1', [{ businessName: 'Shop', email: 'Owner@Shop.test' }, { businessName: 'Other', email: 'new@other.test' }], 'list');
    expect(r.invalid).toEqual([{ index: 0, reason: 'suppressed (opted out)' }]);
    expect(r.created).toBe(1);
  });
});

describe('Send limits (P3)', () => {
  const prisma = fakePrisma();
  it.each([
    ['recipient', [1, 0, 0], 'this recipient'],
    ['tenant', [0, 20, 0], 'this company'],
    ['global', [0, 0, 50], 'Global pilot'],
  ])('blocks when the %s limit is exhausted', async (_n, counts, msg) => {
    prisma.outreachDraft.count.mockReset();
    for (const c of counts) prisma.outreachDraft.count.mockResolvedValueOnce(c);
    await expect(assertWithinSendLimits(prisma, 'c1', 'a@b.test', 'self')).rejects.toThrow(msg);
  });

  it('counts other in-flight (SENDING) drafts and excludes itself, so concurrent sends cannot exceed a limit', async () => {
    prisma.outreachDraft.count.mockReset().mockResolvedValue(0);
    await assertWithinSendLimits(prisma, 'c1', 'a@b.test', 'self');
    const where = prisma.outreachDraft.count.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['SENDING', 'SENT'] });
    expect(where.id).toEqual({ not: 'self' });
  });

  it('a malformed limit fails closed; 0 blocks', async () => {
    prisma.outreachDraft.count.mockReset().mockResolvedValue(0);
    process.env.PILOT_MAX_SENDS_PER_TENANT_PER_DAY = 'lots';
    await expect(assertWithinSendLimits(prisma, 'c1', 'a@b.test', 'self')).rejects.toThrow('misconfigured');
    process.env.PILOT_MAX_SENDS_PER_TENANT_PER_DAY = '0';
    await expect(assertWithinSendLimits(prisma, 'c1', 'a@b.test', 'self')).rejects.toThrow('this company');
  });
});

describe('Emergency stop and publishing (P2, P3)', () => {
  it('emergency stop: "true" and any malformed value stop; unset/"false" run', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on', 'garbage']) expect(emergencyStopActive({ AEVORA_EMERGENCY_STOP: v } as any)).toBe(true);
    for (const v of [undefined, '', 'false', ' False ']) expect(emergencyStopActive({ AEVORA_EMERGENCY_STOP: v } as any)).toBe(false);
  });

  it.each(['EMAIL', 'WHATSAPP', 'PUBLISH'] as const)('blocks %s when stopped, on kill switch, and when the switch store is unreadable', async (ch) => {
    const prisma = fakePrisma();
    process.env.AEVORA_EMERGENCY_STOP = 'true';
    await expect(assertOutboundAllowed(prisma, 'c1', ch)).rejects.toThrow('emergency stop');
    delete process.env.AEVORA_EMERGENCY_STOP;
    prisma.killSwitchConfig.findFirst.mockResolvedValueOnce({ feature: 'OUTBOUND_ALL' });
    await expect(assertOutboundAllowed(prisma, 'c1', ch)).rejects.toThrow('kill switch OUTBOUND_ALL');
    prisma.killSwitchConfig.findFirst.mockRejectedValueOnce(new Error('db unreachable'));
    await expect(assertOutboundAllowed(prisma, 'c1', ch)).rejects.toThrow('db unreachable');
    await expect(assertOutboundAllowed(prisma, 'c1', ch)).resolves.toBeUndefined();
  });

  it('the email gate and the WhatsApp push both stop under the emergency stop', async () => {
    process.env.AEVORA_EMERGENCY_STOP = 'true';
    const prisma = fakePrisma();
    const svc = new IntegrationService(prisma, { send: jest.fn() } as any, {} as any, { log: jest.fn() } as any);
    await expect(svc.sendEmail('c1', ExecutionEnvironment.SANDBOX, { to: 'a@b.test', subject: 'S', body: 'B' })).rejects.toThrow('emergency stop');
    expect(prisma.outreachDraft.create).not.toHaveBeenCalled();
    const realtime = { broadcastToUser: jest.fn() };
    const wa = new WhatsAppOutreachService({
      ...prisma,
      outreachCampaign: { upsert: jest.fn().mockResolvedValue({ id: 'camp', status: 'SCHEDULED' }), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'camp', status: 'SCHEDULED' }), update: jest.fn() },
      outreachScript: { findFirst: jest.fn().mockResolvedValue(null) },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ chairmanId: 'chair' }) },
    } as any, realtime as any, { createDemoForLead: jest.fn().mockResolvedValue(null) } as any);
    await expect(wa.sendOutreachMessage('c1', { id: 'l1', companyId: 'c1', name: 'Shop', contactPhone: '+91 1' } as any)).rejects.toThrow('emergency stop');
    expect(realtime.broadcastToUser).not.toHaveBeenCalled();
  });

  it('publishing is off unless the server flag is set; draft-time demo generation never calls Vercel', async () => {
    const prisma = fakePrisma();
    await expect(assertPublishingAllowed(prisma, 'c1')).rejects.toThrow('DEMO_PUBLISHING_ENABLED');
    process.env.VERCEL_API_TOKEN = 'token-present-but-publishing-disabled';
    const demo = new DemoFactoryService(prisma);
    expect(await demo.createDemoForLead({ id: 'l1', companyId: 'c1', name: 'Shop' })).toBeNull();
    process.env.DEMO_PUBLISHING_ENABLED = 'true';
    process.env.AEVORA_EMERGENCY_STOP = 'true'; // enabled but stopped → still nothing
    expect(await demo.createDemoForLead({ id: 'l1', companyId: 'c1', name: 'Shop' })).toBeNull();
    expect(netFetch).not.toHaveBeenCalled();
  });

  it('demo takedown makes no external call during an emergency stop', async () => {
    process.env.AEVORA_EMERGENCY_STOP = 'true';
    process.env.VERCEL_API_TOKEN = 'token';
    const prisma = { ...fakePrisma(), demoSite: { findUnique: jest.fn().mockResolvedValue({ id: 's', companyId: 'c1', status: 'LIVE', vercelProjectId: 'p' }), update: jest.fn() } } as any;
    await expect(new DemoFactoryService(prisma).deleteProject('s')).rejects.toThrow('emergency stop');
    expect(prisma.demoSite.update).not.toHaveBeenCalled();
  });
});

describe('Inbound opt-out replies are persisted', () => {
  // Every prisma model/method resolves harmlessly; only the suppression upsert is observed.
  const anyPrisma = (upsert: jest.Mock) => new Proxy({}, {
    get: (_t, model) => model === 'emailSuppression' ? { upsert }
      : model === '$transaction' ? async (f: any) => f(anyPrisma(upsert))
      : new Proxy({}, { get: (_t2, m) => async () => (m === 'create' || m === 'update' || m === 'findUniqueOrThrow' ? { id: 'x', chairmanId: 'chair' } : m === 'count' ? 0 : m === 'findMany' ? [] : null) }),
  }) as any;

  it('a reply asking to unsubscribe adds the sender to the suppression list; an autoresponder does not', async () => {
    const { InboundMessageService } = await import('../sales-outreach/inbound-message.service');
    const upsert = jest.fn().mockResolvedValue({});
    const svc = new InboundMessageService(anyPrisma(upsert), { broadcastToUser: jest.fn() } as any, {} as any);
    await svc.ingest('c1', 'EMAIL', 'Owner@Shop.test', 'Please unsubscribe me from these emails', 'Re: idea', { lead: null });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId_email: { companyId: 'c1', email: 'owner@shop.test' } },
      create: expect.objectContaining({ reason: 'INBOUND_REPLY' }),
    }));
    upsert.mockClear();
    await svc.ingest('c1', 'EMAIL', 'bot@shop.test', 'Out of office. To unsubscribe from our newsletter click here', 'Automatic reply', { lead: null });
    expect(upsert).not.toHaveBeenCalled();
  });
});
