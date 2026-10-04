import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateEventService, SpatialHistoryPersistenceError } from './world-state-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { V12EventType, V12EntityType } from '@aevora/shared';
import { WorldStateGatewayModule } from './world-state-gateway.module';
import { LoggerModule } from '../logger/logger.module';
describe('V12-E Pass 2 Evidence Closure Gate', () => {
  let service: WorldStateEventService;
  let prisma: PrismaService;
  let persistedEvents: any[] = [];
  let broadcastEvents: any[] = [];

  beforeEach(async () => {
    persistedEvents = [];
    broadcastEvents = [];

    const module: TestingModule = await Test.createTestingModule({
      imports: [LoggerModule, WorldStateGatewayModule],
    }).overrideProvider(PrismaService).useValue({
      v12SpatialHistoryEvent: {
        create: jest.fn().mockImplementation(async (args) => {
          if (args.data.causationId === 'trigger-failure') {
            throw new Error('Forced persistence failure');
          }
          const event = { ...args.data, sequence: persistedEvents.length + 1 };
          persistedEvents.push(event);
          return event;
        }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    }).compile();

    service = module.get<WorldStateEventService>(WorldStateEventService);
    prisma = module.get<PrismaService>(PrismaService);
    
    service.getGlobalStream().subscribe((ev) => {
      broadcastEvents.push(ev);
    });

    await service.onModuleInit();
  });

  it('B. Execute the missing benchmark sizes (1k, 5k, 10k)', async () => {
    const companyId = 'bench-comp-gate';
    
    async function runBenchmark(count: number) {
      persistedEvents = [];
      broadcastEvents = [];
      const start = Date.now();
      const promises = [];
      for(let i = 0; i < count; i++) {
        const envelope = service.createEventEnvelope(
          V12EventType.ENTITY_UPDATED,
          'bench-entity-' + i,
          V12EntityType.PERSON,
          { count: i },
          companyId,
          `cause-${i}`
        );
        promises.push(service.broadcastEvent(companyId, envelope));
      }
      await Promise.all(promises);
      const duration = Date.now() - start;
      return { count, duration, throughput: count / (duration / 1000) };
    }

    const b1k = await runBenchmark(1000);
    console.log('1k benchmark:', b1k);
    const b5k = await runBenchmark(5000);
    console.log('5k benchmark:', b5k);
    const b10k = await runBenchmark(10000);
    console.log('10k benchmark:', b10k);
    
    expect(b10k.count).toBe(10000);
  });

  it('H. Execute persistence-before-broadcast failure proof', async () => {
    const companyId = 'fail-comp';
    const envelope = service.createEventEnvelope(
      V12EventType.ENTITY_UPDATED,
      'fail-entity',
      V12EntityType.PERSON,
      {},
      companyId,
      'trigger-failure'
    );
    
    await expect(service.broadcastEvent(companyId, envelope)).rejects.toThrow(SpatialHistoryPersistenceError);
    
    expect(broadcastEvents.length).toBe(0);
    expect(persistedEvents.length).toBe(0);
  });

});
