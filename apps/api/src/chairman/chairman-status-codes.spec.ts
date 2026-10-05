import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ChairmanController } from './chairman.controller';

/** V14 closure: cross-company / unowned resources answer 404 exactly like missing ones (anti-enumeration). */
describe('Chairman status-code semantics', () => {
  it('knowledge from another company is 404, identical to a missing record', async () => {
    const prisma: any = { knowledgeRecord: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'k-B' ? { id: 'k-B', companyId: 'B' } : null)) } };
    const svc = new KnowledgeService(prisma);
    const foreign = await svc.getKnowledgeById('A', 'k-B').catch(e => e);
    const missing = await svc.getKnowledgeById('A', 'nope').catch(e => e);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect(foreign.message).toBe(missing.message);
  });

  describe('command approve/reject', () => {
    const prisma: any = { chairman: { findUnique: jest.fn(async () => ({ id: 'chair-A' })) } };
    const commands: any = {
      approveCommand: jest.fn(async (id: string) => (id === 'cmd-A' ? { id, status: 'COMPLETED' } : null)),
      rejectCommand: jest.fn(async (id: string) => (id === 'cmd-A' ? { id, status: 'REJECTED' } : null)),
    };
    const args: any[] = Array(14).fill({});
    args[0] = prisma;
    args[11] = commands;
    const ctrl = new (ChairmanController as any)(...args) as ChairmanController;
    const req = { user: { actorId: 'chair-A', actorRole: 'CHAIRMAN' } };

    it.each(['approveCommand', 'rejectCommand'] as const)('%s: unowned/missing/non-pending command is 404, not an empty 200', async (m) => {
      await expect((ctrl as any)[m](req, 'cmd-B')).rejects.toBeInstanceOf(NotFoundException);
    });
    it.each(['approveCommand', 'rejectCommand'] as const)('%s: own pending command still returns the result', async (m) => {
      await expect((ctrl as any)[m](req, 'cmd-A')).resolves.toMatchObject({ id: 'cmd-A' });
    });
  });
});
