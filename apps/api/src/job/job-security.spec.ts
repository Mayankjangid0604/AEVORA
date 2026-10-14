import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../authorization/roles.guard';
import { JobController } from './job.controller';
import { JobTaskBridgeService } from './job-task-bridge.service';

describe('Job tenant & authorization guards (P0-4, P0-5)', () => {
  const user = { companyId: 'tenant-a', actorId: 'chair-a' };

  it('controller requires CHAIRMAN/MANAGEMENT', () => {
    expect(new Reflector().get(ROLES_KEY, JobController)).toEqual(['CHAIRMAN', 'MANAGEMENT']);
  });

  it('controller ignores body companyId and environment; tenant comes from the token', async () => {
    const enqueue = jest.fn().mockResolvedValue({ id: 'j' });
    const c = new JobController({ enqueue } as any);
    await c.enqueueJob({ type: 'TASK_EXECUTION', environment: 'PRODUCTION', payload: { taskId: 't', companyId: 'tenant-b' } }, { user });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'tenant-a', environment: 'SIMULATION', payload: { taskId: 't', companyId: 'tenant-a' },
    }));
  });

  it('controller rejects job types without a handler', async () => {
    const c = new JobController({ enqueue: jest.fn() } as any);
    await expect(c.enqueueJob({ type: 'SEND_EMAIL', payload: {} }, { user })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('execution uses job.companyId and refuses a payload naming another tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const bridge = new JobTaskBridgeService({ task: { findFirst } } as any, {} as any, {} as any, {} as any, {} as any);
    await expect(bridge.executeTaskJob({ id: 'j1', companyId: 'tenant-a', payload: { taskId: 't', companyId: 'tenant-b' } } as any)).rejects.toThrow(/tenant mismatch/);
    await expect(bridge.executeTaskJob({ id: 'j2', companyId: null, payload: { taskId: 't', companyId: 'tenant-b' } } as any)).rejects.toThrow(/no tenant/);
    expect(findFirst).not.toHaveBeenCalled();
    await expect(bridge.executeTaskJob({ id: 'j3', companyId: 'tenant-a', payload: { taskId: 't' } } as any)).rejects.toThrow(/not found in company tenant-a/);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't', companyId: 'tenant-a' } }));
  });
});
