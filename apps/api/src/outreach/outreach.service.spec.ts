import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ExecutionEnvironment } from '@prisma/client';
import { OutreachService } from './outreach.service';

describe('OutreachService.approveAndSend — send safety', () => {
  const draft = { id: 'd1', companyId: 'c1', status: 'PENDING_APPROVAL', recipientEmail: 'Owner@Shop.test', subject: 's', messageBody: 'b' };
  let prisma: any;
  let integration: any;
  let service: OutreachService;
  const env = process.env.OUTREACH_ENVIRONMENT;

  beforeEach(() => {
    delete process.env.OUTREACH_ENVIRONMENT;
    prisma = {
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', companyId: 'c1', status: 'ACTIVE', role: { accessLevel: 'CHAIRMAN' } }) },
      outreachDraft: {
        findUnique: jest.fn().mockResolvedValue(draft),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      outreachResponse: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSuppression: { findUnique: jest.fn().mockResolvedValue(null) },
      salesLead: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    integration = { sendEmail: jest.fn().mockResolvedValue({ ok: true }) };
    service = new OutreachService(prisma, integration, { log: jest.fn(), error: jest.fn() } as any);
  });
  afterAll(() => { process.env.OUTREACH_ENVIRONMENT = env; });

  it('sends through SANDBOX by default, never hardcoded PRODUCTION', async () => {
    await service.approveAndSend('c1', 'e1', 'd1');
    expect(integration.sendEmail.mock.calls[0][1]).toBe(ExecutionEnvironment.SANDBOX);
    expect(prisma.outreachDraft.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
  });

  it('refuses a second concurrent approval (no double send)', async () => {
    prisma.outreachDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approveAndSend('c1', 'e1', 'd1')).rejects.toBeInstanceOf(ConflictException);
    expect(integration.sendEmail).not.toHaveBeenCalled();
  });

  it('blocks unsubscribed recipients', async () => {
    prisma.outreachDraft.findMany.mockResolvedValue([{ id: 'old' }]);
    prisma.outreachResponse.findFirst.mockResolvedValue({ id: 'r1' });
    await expect(service.approveAndSend('c1', 'e1', 'd1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(integration.sendEmail).not.toHaveBeenCalled();
  });

  it('blocks recipients of a disqualified lead', async () => {
    prisma.salesLead.findFirst.mockResolvedValue({ id: 'l1' });
    await expect(service.approveAndSend('c1', 'e1', 'd1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(integration.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects approval by a non-management role', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'e1', companyId: 'c1', status: 'ACTIVE', role: { accessLevel: 'STAFF' } });
    await expect(service.approveAndSend('c1', 'e1', 'd1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the company Chairman (JWT actor is a Chairman, not an Employee)', async () => {
    prisma.company.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.employee.findUnique.mockResolvedValue(null);
    await service.approveAndSend('c1', 'chairman-1', 'd1');
    expect(integration.sendEmail).toHaveBeenCalled();
  });
});
