import { WorldStateConsumer } from './world-state-consumer';
import { V12EventType, V12EventEnvelope } from '../events';
import { V12EntityType } from '../world-state';

// Mock EventSource
class MockEventSource {
  public onmessage: ((event: any) => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public onopen: (() => void) | null = null;
  
  constructor(public url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  
  close() {}
}

describe('WorldStateConsumer Performance', () => {
  it('should handle 10,000 entities in snapshot and rapid updates', async () => {
    const startBuild = performance.now();
    const NUM_ENTITIES = 10000;
    const NUM_UPDATES = 1000;

    const entities: Record<string, any> = {};
    for (let i = 0; i < NUM_ENTITIES; i++) {
      entities[`entity-${i}`] = {
        id: `entity-${i}`,
        type: V12EntityType.PERSON,
        name: `Person ${i}`
      };
    }

    const snapshot = {
      version: 'v12',
      sequence: 100,
      timestamp: Date.now(),
      entities
    };
    const endBuild = performance.now();
    console.log(`Generated 10k entities in ${endBuild - startBuild}ms`);

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
    
    const consumer = new WorldStateConsumer({
      companyId: 'comp-1',
      apiBaseUrl: 'http://test',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });

    const startSnapshot = performance.now();
    await consumer.connect();
    const endSnapshot = performance.now();
    console.log(`Applied 10k entities snapshot in ${endSnapshot - startSnapshot}ms`);
    
    expect(consumer.getEntities().size).toBe(NUM_ENTITIES);

    // Generate 1k rapid updates
    const updates: V12EventEnvelope[] = [];
    for (let i = 0; i < NUM_UPDATES; i++) {
      updates.push({
        schemaVersion: '1.0',
        eventId: `update-${i}`,
        eventType: V12EventType.ENTITY_UPDATED,
        sequence: 101 + i,
        entityId: `entity-${i % NUM_ENTITIES}`,
        entityType: V12EntityType.PERSON,
        payload: { name: `Person ${i} updated` },
        authoritativeTimestamp: Date.now()
      });
    }

    const startUpdates = performance.now();
    for (const update of updates) {
      (consumer as any).handleEvent(update);
    }
    const endUpdates = performance.now();
    
    const updateTime = endUpdates - startUpdates;
    console.log(`Applied 1k updates in ${updateTime}ms`);
    
    expect(consumer.getSequence()).toBe(100 + NUM_UPDATES);
    expect(updateTime).toBeLessThan(500); // Target: < 500ms for 1000 updates
  });
});
