import { OodaPhase } from '@prisma/client';
import { ItlErrorPoolService } from './itl-error-pool.service';

/** V14 slice 1 closure: an HTTP-triggered pool scan only touches the caller's company. */
describe('ItlErrorPoolService.processPool company scoping', () => {
  const cycles = [
    { id: 'cyc-A', companyId: 'A', phase: OodaPhase.FAILED, error: 'ECONNREFUSED', createdAt: new Date(1) },
    { id: 'cyc-B', companyId: 'B', phase: OodaPhase.FAILED, error: 'ECONNREFUSED', createdAt: new Date(2) },
  ];
  const prisma: any = {
    operatingLoopCycle: {
      findMany: jest.fn(async ({ where }: any) => cycles.filter(c => c.phase === where.phase && (!where.companyId || c.companyId === where.companyId))),
      update: jest.fn(async () => ({})),
    },
    operationalAlert: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})), update: jest.fn(async () => ({})) },
  };
  const service = new ItlErrorPoolService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('with a companyId, reads and mutates only that company\'s cycles', async () => {
    await service.processPool('A');
    expect(prisma.operatingLoopCycle.findMany.mock.calls[0][0].where).toEqual({ phase: OodaPhase.FAILED, companyId: 'A' });
    const touched = prisma.operatingLoopCycle.update.mock.calls.map((c: any) => c[0].where.id);
    expect(touched).not.toContain('cyc-B');
  });

  it('without a companyId (background scanner) keeps the existing all-company behaviour', async () => {
    await service.processPool();
    expect(prisma.operatingLoopCycle.findMany.mock.calls[0][0].where).toEqual({ phase: OodaPhase.FAILED });
  });
});
