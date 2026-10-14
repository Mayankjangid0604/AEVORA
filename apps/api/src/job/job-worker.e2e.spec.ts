/**
 * Journey E — the real JobWorkerService poll loop against a disposable Postgres (port 5444 only).
 * Run: E2E_DB=1 DATABASE_URL=postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e npx jest job-worker.e2e
 */
import { PrismaService } from '../prisma/prisma.service';
import { JobService } from './job.service';
import { JobWorkerService } from './job-worker.service';

const run = process.env.E2E_DB === '1' && /:(5444)\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

run('Background jobs on real DB', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaService();
  const tag = `e2e-job-${Date.now()}`;
  const calls: Record<string, number> = {};
  const bridge = {
    executeTaskJob: async (job: any) => {
      calls[job.id] = (calls[job.id] ?? 0) + 1;
      if (job.payload?.hangMs) {
        await new Promise((resolve) => setTimeout(resolve, job.payload.hangMs));
      }
      if (job.payload.failTimes >= calls[job.id]) throw new Error(`boom ${calls[job.id]}`);
    },
  };
  const worker = new JobWorkerService(prisma, bridge as any);
  const jobs = new JobService(prisma, {} as any, { log: () => undefined } as any);
  const poll = () => (worker as any).poll();
  const get = (id: string) => prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
  // Make a requeued job due now instead of waiting out the backoff.
  const due = (id: string) => prisma.backgroundJob.update({ where: { id }, data: { nextAttemptAt: new Date(0) } });

  beforeAll(async () => {
    expect(await prisma.backgroundJob.count({ where: { status: { in: ['QUEUED', 'PROCESSING'] } } })).toBe(0); // only our jobs in play
  });
  afterAll(async () => {
    await prisma.backgroundJob.deleteMany({ where: { idempotencyKey: { contains: tag } } });
    await prisma.$disconnect();
  });

  it('executes, retries with backoff, then completes', async () => {
    const j = await jobs.enqueue({ type: 'TASK_EXECUTION', payload: { failTimes: 1 }, idempotencyKey: `${tag}-retry` } as any);
    await poll();
    let row = await get(j.id);
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 1, lastError: 'boom 1' });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    await poll(); // not yet due → untouched
    expect((await get(j.id)).attempts).toBe(1);
    await due(j.id);
    await poll();
    row = await get(j.id);
    expect(row).toMatchObject({ status: 'COMPLETED', attempts: 2 });
    expect(calls[j.id]).toBe(2);
  });

  it('stops at maxAttempts exactly (terminal FAILED)', async () => {
    const j = await jobs.enqueue({ type: 'TASK_EXECUTION', payload: { failTimes: 99 }, idempotencyKey: `${tag}-dead` } as any);
    for (let i = 0; i < 5; i++) { await due(j.id).catch(() => undefined); await poll(); }
    expect(await get(j.id)).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(calls[j.id]).toBe(3);
  });

  it('unknown job type fails instead of fake-completing', async () => {
    const j = await jobs.enqueue({ type: 'NOT_A_REAL_TYPE', payload: {}, idempotencyKey: `${tag}-unknown` } as any);
    await poll();
    expect(await get(j.id)).toMatchObject({ status: 'FAILED', lastError: 'No handler registered for job type NOT_A_REAL_TYPE' });
  });

  it('idempotent enqueue and single execution under concurrent workers', async () => {
    const a = await jobs.enqueue({ type: 'TASK_EXECUTION', payload: { failTimes: 0 }, idempotencyKey: `${tag}-idem` } as any);
    const b = await jobs.enqueue({ type: 'TASK_EXECUTION', payload: { failTimes: 0 }, idempotencyKey: `${tag}-idem` } as any);
    expect(b.id).toBe(a.id);
    const w2 = new JobWorkerService(prisma, bridge as any);
    await Promise.all([poll(), (w2 as any).poll(), poll()]);
    expect(await get(a.id)).toMatchObject({ status: 'COMPLETED', attempts: 1 });
    expect(calls[a.id]).toBe(1);
  });

  it('idempotency keys are tenant-scoped: same key in another tenant neither collides nor reveals the job', async () => {
    const a = await jobs.enqueue({ type: 'NOOP', companyId: 'tenant-a', payload: { secret: 'tenant-A' }, idempotencyKey: `${tag}-shared` } as any);
    const b = await jobs.enqueue({ type: 'NOOP', companyId: 'tenant-b', payload: { secret: 'tenant-B' }, idempotencyKey: `${tag}-shared` } as any);
    expect(b.id).not.toBe(a.id);
    expect(b.payload).toEqual({ secret: 'tenant-B' }); // never A's payload
    expect([a.idempotencyKey, b.idempotencyKey]).toEqual([`tenant-a:${tag}-shared`, `tenant-b:${tag}-shared`]);
    await prisma.backgroundJob.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { status: 'CANCELLED' } });
  });

  it('enforces per-job timeout on hanging task executions', async () => {
    const j = await jobs.enqueue({
      type: 'TASK_EXECUTION',
      payload: { hangMs: 500, timeoutMs: 50 },
      idempotencyKey: `${tag}-timeout`,
    } as any);

    await poll();
    const row = await get(j.id);
    expect(row.status).toBe('QUEUED');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toMatch(/Job execution timed out after 50ms/);
  });

  it('stale worker cannot overwrite status after lease is lost or stolen', async () => {
    let leaseStolen = false;
    const slowBridge = {
      executeTaskJob: async (job: any) => {
        if (leaseStolen) return;
        // Simulate lease expiration / reclamation while this worker is running
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: 'PAUSED', workerId: null, lockedAt: null },
        });
        leaseStolen = true;
      },
    };

    const staleWorker = new JobWorkerService(prisma, slowBridge as any, 'stale-worker-1');
    const j = await jobs.enqueue({
      type: 'TASK_EXECUTION',
      payload: { failTimes: 0 },
      idempotencyKey: `${tag}-stale-lease`,
    } as any);

    // Run poll with stale worker
    await (staleWorker as any).poll();

    // The job should remain PAUSED (not overwritten to COMPLETED by staleWorker)
    const row = await get(j.id);
    expect(row.status).toBe('PAUSED');
  });
});
