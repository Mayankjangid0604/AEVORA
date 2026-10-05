import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AeDecisionStatus } from '@prisma/client';
import { AeDecisionService } from './ae-decision.service';

/** V14 closure: the owning Chairman can decide/defer/dismiss an AeChairmanDecision; nobody else gains access. */
describe('AeDecisionService decider authorization', () => {
  const decisions: Record<string, any> = {
    'dec-A': { id: 'dec-A', companyId: 'A', status: AeDecisionStatus.PENDING },
    'dec-B': { id: 'dec-B', companyId: 'B', status: AeDecisionStatus.PENDING },
  };
  const prisma: any = {
    company: { findFirst: jest.fn(async ({ where }: any) => (where.id === 'A' && where.chairmanId === 'chair-A' ? { id: 'A' } : null)) },
    employee: { findUnique: jest.fn(async ({ where }: any) => (({ 'emp-A': { companyId: 'A', status: 'ACTIVE' }, 'emp-off': { companyId: 'A', status: 'TERMINATED' } } as any)[where.id] ?? null)) },
    aeChairmanDecision: {
      findUnique: jest.fn(async ({ where }: any) => decisions[where.id] ?? null),
      update: jest.fn(async ({ where, data }: any) => ({ ...decisions[where.id], ...data })),
    },
  };
  const audit: any = { record: jest.fn(async () => ({})) };
  const svc = new AeDecisionService(prisma, audit);
  beforeEach(() => jest.clearAllMocks());

  it.each(['decide', 'defer', 'dismiss'] as const)('owning Chairman can %s', async (op) => {
    const r: any = await (svc as any)[op]('A', 'chair-A', 'dec-A');
    expect(r.id).toBe('dec-A');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'chair-A', companyId: 'A' }));
  });

  it('a Chairman who does not own the company is rejected', async () => {
    await expect(svc.decide('A', 'chair-B', 'dec-A')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.aeChairmanDecision.update).not.toHaveBeenCalled();
  });

  it("another company's decision stays 404 even for an owning Chairman", async () => {
    await expect(svc.decide('A', 'chair-A', 'dec-B')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('employee rules are unchanged: active employee allowed, inactive rejected', async () => {
    await expect(svc.defer('A', 'emp-A', 'dec-A')).resolves.toBeDefined();
    await expect(svc.defer('A', 'emp-off', 'dec-A')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
