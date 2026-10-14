import { WorldStateConsumer, ConnectionState } from './world-state-consumer';
import { V12EventType, V12EntityType } from '../index';

// Mock EventSource
class MockEventSource {
  public onmessage: ((event: any) => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public onopen: (() => void) | null = null;
  
  constructor(public url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }
  
  close() {}
  
  // Test helper
  emitMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

describe('WorldStateConsumer', () => {
  let fetchMock: jest.Mock;
  
  beforeEach(() => {
    fetchMock = jest.fn();
  });
  
  it('should initialize and connect, loading snapshot and streaming', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 100,
        timestamp: Date.now(),
        entities: {
          'entity-1': { id: 'entity-1', type: V12EntityType.PERSON, name: 'John' }
        }
      })
    });
    
    const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });
    
    expect(consumer.getState()).toBe(ConnectionState.INITIALIZING);
    
    const stateChanges: ConnectionState[] = [];
    consumer.onStateChange(state => stateChanges.push(state));
    
    await consumer.connect();
    
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/world-state/snapshot/company-123', { headers: {} });
    expect(consumer.getSequence()).toBe(100);
    expect(consumer.getEntities().has('entity-1')).toBe(true);
    
    expect(stateChanges).toContain(ConnectionState.LOADING_SNAPSHOT);
    expect(stateChanges).toContain(ConnectionState.SYNCHRONIZED);
    
    // Wait for mock EventSource to open
    await new Promise(r => setTimeout(r, 20));
    expect(consumer.getState()).toBe(ConnectionState.STREAMING);
  });
  
  it('should process a valid delta sequence', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 100,
        entities: {}
      })
    });
    
    const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });
    
    await consumer.connect();
    await new Promise(r => setTimeout(r, 20)); // wait for stream to open
    
    // Grab the mock event source instance (it's internal but we can mock it by intercepting or using prototype)
    const es = (consumer as any).eventSource as MockEventSource;
    
    const updateSpy = jest.fn();
    consumer.onEntityUpdated(updateSpy);
    
    es.emitMessage({
      eventId: 'evt-1',
      eventType: V12EventType.ENTITY_CREATED,
      entityId: 'ent-1',
      entityType: V12EntityType.PERSON,
      sequence: 101,
      payload: { id: 'ent-1', name: 'Alice', type: V12EntityType.PERSON }
    });
    
    expect(consumer.getSequence()).toBe(101);
    expect(consumer.getEntity('ent-1')).toBeDefined();
    expect(consumer.getEntity('ent-1')?.name).toBe('Alice');
    expect(updateSpy).toHaveBeenCalled();
  });

  it('applies MOVEMENT_CANCELLED to movementStates — regression for a bug where the backend emitted a non-matching event type and cancellation never reached consumers', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: 'v12', sequence: 100, entities: {} }) });
    const consumer = new WorldStateConsumer({
      companyId: 'company-123', apiBaseUrl: 'http://localhost:3000', fetchFn: fetchMock, EventSourceClass: MockEventSource,
    });
    await consumer.connect();
    await new Promise(r => setTimeout(r, 20));
    const es = (consumer as any).eventSource as MockEventSource;

    es.emitMessage({
      eventId: 'evt-1', eventType: V12EventType.ENTITY_CREATED, entityId: 'emp-1', entityType: V12EntityType.PERSON,
      sequence: 101, payload: { id: 'emp-1', name: 'Bob', type: V12EntityType.PERSON },
    });
    es.emitMessage({
      eventId: 'evt-2', eventType: V12EventType.MOVEMENT_STARTED, entityId: 'emp-1', entityType: V12EntityType.PERSON,
      sequence: 102, payload: { movementState: { movementState: 'MOVING', entityId: 'emp-1' } },
    });
    expect(consumer.getMovementStates().get('emp-1')).toEqual({ movementState: 'MOVING', entityId: 'emp-1' });

    es.emitMessage({
      eventId: 'evt-3', eventType: V12EventType.MOVEMENT_CANCELLED, entityId: 'emp-1', entityType: V12EntityType.PERSON,
      sequence: 103, payload: { movementState: { movementState: 'INTERRUPTED', entityId: 'emp-1' } },
    });
    expect(consumer.getMovementStates().get('emp-1')).toEqual({ movementState: 'INTERRUPTED', entityId: 'emp-1' });
  });

  it('should ignore duplicate sequence and reconcile on gap', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 100,
        entities: {}
      })
    });
    
    const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });
    
    await consumer.connect();
    await new Promise(r => setTimeout(r, 20)); // wait for stream to open
    
    const es = (consumer as any).eventSource as MockEventSource;
    
    // Duplicate 100
    es.emitMessage({
      eventId: 'evt-dup',
      eventType: V12EventType.ENTITY_CREATED,
      entityId: 'ent-2',
      sequence: 100,
      payload: { id: 'ent-2' }
    });
    
    expect(consumer.getSequence()).toBe(100);
    expect(consumer.getEntity('ent-2')).toBeUndefined(); // Ignored
    
    // Gap 102
    fetchMock.mockClear();
    es.emitMessage({
      eventId: 'evt-gap',
      eventType: V12EventType.ENTITY_CREATED,
      entityId: 'ent-3',
      sequence: 102,
      payload: { id: 'ent-3' }
    });
    
    // Should trigger reconcile
    // Should trigger reconcile
    expect(consumer.getState()).toBe(ConnectionState.LOADING_SNAPSHOT); // It starts reconcile
    expect(fetchMock).toHaveBeenCalled();
  });

  it('should handle reconnect behavior correctly', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 100,
        entities: {}
      })
    });
    
    const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });

    await consumer.connect();
    await new Promise(r => setTimeout(r, 20));
    const es = (consumer as any).eventSource as MockEventSource;

    // Simulate network error
    if (es.onerror) es.onerror(new Error('Network error'));
    
    expect(consumer.getState()).toBe(ConnectionState.DEGRADED);
    
    // Wait for the reconnect timeout
    await new Promise(r => setTimeout(r, 1100));
    
    expect(fetchMock).toHaveBeenCalledTimes(2); // First connect, then reconcile
  });

  it('should not accumulate duplicate listeners on reconnect', async () => {
     // A memory leak test essentially
     const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });
    // This is handled by external caller using the consumer, not the consumer itself.
    // The consumer's arrays should only grow when explicitly told to.
    const spy = jest.fn();
    consumer.onStateChange(spy);
    expect((consumer as any).onStateChangeHandlers.length).toBe(1);
    
    consumer.disconnect();
    expect((consumer as any).onStateChangeHandlers.length).toBe(1); // Still 1, we don't clear external listeners
  });

  it('should cleanly remove entities on snapshot and trigger UI sync', async () => {
     fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 100,
        entities: {
          'ent-1': { id: 'ent-1', type: V12EntityType.PERSON, name: 'Old' }
        }
      })
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 200,
        entities: {
          'ent-2': { id: 'ent-2', type: V12EntityType.PERSON, name: 'New' }
        }
      })
    });

    const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });

    await consumer.connect(); // 1st snapshot
    expect(consumer.getEntity('ent-1')).toBeDefined();
    
    // Trigger reconcile
    await (consumer as any).reconcile(); // 2nd snapshot
    
    expect(consumer.getEntity('ent-1')).toBeUndefined();
    expect(consumer.getEntity('ent-2')).toBeDefined();
  });

  it('should ignore malformed poison pill events and not corrupt sequence', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'v12',
        sequence: 100,
        entities: {}
      })
    });
    
    const consumer = new WorldStateConsumer({
      companyId: 'company-123',
      apiBaseUrl: 'http://localhost:3000',
      fetchFn: fetchMock,
      EventSourceClass: MockEventSource
    });
    
    await consumer.connect();
    await new Promise(r => setTimeout(r, 20));
    
    const es = (consumer as any).eventSource as MockEventSource;
    
    // Poison pill 1: Bad JSON string
    if (es.onmessage) es.onmessage({ data: 'not-json' });
    
    // Poison pill 2: Missing sequence
    es.emitMessage({
      eventId: 'evt-bad-1',
      eventType: V12EventType.ENTITY_CREATED,
      entityId: 'ent-bad-1'
      // missing sequence
    });

    // Poison pill 3: Missing eventType
    es.emitMessage({
      eventId: 'evt-bad-2',
      entityId: 'ent-bad-2',
      sequence: 101
    });

    // Valid event after poison pill
    es.emitMessage({
      eventId: 'evt-valid-1',
      eventType: V12EventType.ENTITY_CREATED,
      entityId: 'ent-valid-1',
      sequence: 101,
      payload: { id: 'ent-valid-1' }
    });

    expect(consumer.getSequence()).toBe(101); // Valid sequence updated correctly
    expect(consumer.getEntity('ent-valid-1')).toBeDefined(); // Valid event processed
    expect(consumer.getEntity('ent-bad-1')).toBeUndefined();
  });
  
  it('Multi-Viewer Consistency: should converge independent consumers to identical authoritative world state', async () => {
    const snapshot = {
      version: 'v12',
      sequence: 100,
      timestamp: Date.now(),
      entities: {
        'entity-A': { id: 'entity-A', type: V12EntityType.PERSON, name: 'Alice' }
      }
    };
    
    // Independent fetch mocks returning the exact same snapshot
    const fetchMock1 = jest.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
    const fetchMock2 = jest.fn().mockResolvedValue({ ok: true, json: async () => snapshot });

    const consumer1 = new WorldStateConsumer({ companyId: 'comp-1', apiBaseUrl: 'http://test1', fetchFn: fetchMock1, EventSourceClass: MockEventSource });
    const consumer2 = new WorldStateConsumer({ companyId: 'comp-1', apiBaseUrl: 'http://test2', fetchFn: fetchMock2, EventSourceClass: MockEventSource });
    
    await Promise.all([consumer1.connect(), consumer2.connect()]);
    
    const eventSequence = [
      {
        eventId: 'evt-1', eventType: V12EventType.ENTITY_CREATED, sequence: 101, entityId: 'entity-B', entityType: V12EntityType.PERSON,
        payload: { name: 'Bob' }, authoritativeTimestamp: Date.now()
      },
      {
        eventId: 'evt-2', eventType: V12EventType.ENTITY_UPDATED, sequence: 102, entityId: 'entity-A', entityType: V12EntityType.PERSON,
        payload: { name: 'Alice 2' }, authoritativeTimestamp: Date.now()
      }
    ];

    // Feed same events to both consumers
    for (const evt of eventSequence) {
      (consumer1 as any).handleEvent(evt);
      (consumer2 as any).handleEvent(evt);
    }

    // Verify independent consumers converged exactly
    const entities1 = Object.fromEntries(consumer1.getEntities());
    const entities2 = Object.fromEntries(consumer2.getEntities());
    expect(entities1).toEqual(entities2);
    expect(consumer1.getSequence()).toBe(102);
    expect(consumer2.getSequence()).toBe(102);
    expect(entities1['entity-A'].name).toBe('Alice 2');
    expect(entities1['entity-B'].name).toBe('Bob');
  });

  describe('Phase 5.2A: Event sequence commit ordering and callback consistency', () => {
    it('should expose the incoming sequence to onEntityUpdated handlers for entity creation', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ version: 'v12', sequence: 100, entities: {} }),
      });
      const consumer = new WorldStateConsumer({
        companyId: 'company-52a',
        apiBaseUrl: 'http://localhost:3000',
        fetchFn: fetchMock,
        EventSourceClass: MockEventSource,
      });
      await consumer.connect();
      await new Promise(r => setTimeout(r, 20));
      const es = (consumer as any).eventSource as MockEventSource;

      let observedSequence = -1;
      let observedEntityInConsumer: any = null;
      consumer.onEntityUpdated((entity) => {
        observedSequence = consumer.getSequence();
        observedEntityInConsumer = consumer.getEntity(entity.id);
      });

      es.emitMessage({
        eventId: 'evt-created',
        eventType: V12EventType.ENTITY_CREATED,
        entityId: 'agent-101',
        entityType: V12EntityType.PERSON,
        sequence: 101,
        payload: { id: 'agent-101', name: 'Agent 101', type: V12EntityType.PERSON },
      });

      expect(observedSequence).toBe(101);
      expect(observedEntityInConsumer).toBeDefined();
      expect(observedEntityInConsumer?.name).toBe('Agent 101');
      expect(consumer.getSequence()).toBe(101);
    });

    it('should expose the incoming sequence to onEntityUpdated handlers for entity updates', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 'v12',
          sequence: 100,
          entities: {
            'agent-102': { id: 'agent-102', name: 'Agent 102 Initial', type: V12EntityType.PERSON },
          },
        }),
      });
      const consumer = new WorldStateConsumer({
        companyId: 'company-52a',
        apiBaseUrl: 'http://localhost:3000',
        fetchFn: fetchMock,
        EventSourceClass: MockEventSource,
      });
      await consumer.connect();
      await new Promise(r => setTimeout(r, 20));
      const es = (consumer as any).eventSource as MockEventSource;

      let observedSequence = -1;
      let observedEntityInConsumer: any = null;
      consumer.onEntityUpdated((entity) => {
        observedSequence = consumer.getSequence();
        observedEntityInConsumer = consumer.getEntity(entity.id);
      });

      es.emitMessage({
        eventId: 'evt-updated',
        eventType: V12EventType.ENTITY_UPDATED,
        entityId: 'agent-102',
        entityType: V12EntityType.PERSON,
        sequence: 101,
        payload: { name: 'Agent 102 Updated' },
      });

      expect(observedSequence).toBe(101);
      expect(observedEntityInConsumer?.name).toBe('Agent 102 Updated');
      expect(consumer.getSequence()).toBe(101);
    });

    it('should expose the incoming sequence and removed state to onEntityRemoved handlers for entity deletion', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 'v12',
          sequence: 100,
          entities: {
            'agent-103': { id: 'agent-103', name: 'Agent 103 To Delete', type: V12EntityType.PERSON },
          },
        }),
      });
      const consumer = new WorldStateConsumer({
        companyId: 'company-52a',
        apiBaseUrl: 'http://localhost:3000',
        fetchFn: fetchMock,
        EventSourceClass: MockEventSource,
      });
      await consumer.connect();
      await new Promise(r => setTimeout(r, 20));
      const es = (consumer as any).eventSource as MockEventSource;

      let observedSequence = -1;
      let observedEntityInConsumer: any = 'not-checked';
      consumer.onEntityRemoved((entityId) => {
        observedSequence = consumer.getSequence();
        observedEntityInConsumer = consumer.getEntity(entityId);
      });

      es.emitMessage({
        eventId: 'evt-deleted',
        eventType: V12EventType.ENTITY_DELETED,
        entityId: 'agent-103',
        sequence: 101,
      });

      expect(observedSequence).toBe(101);
      expect(observedEntityInConsumer).toBeUndefined();
      expect(consumer.getSequence()).toBe(101);
      expect(consumer.getEntity('agent-103')).toBeUndefined();
    });

    it('should roll back sequence if delta application throws an error, avoiding false sequence advancement', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ version: 'v12', sequence: 100, entities: {} }),
      });
      const consumer = new WorldStateConsumer({
        companyId: 'company-52a',
        apiBaseUrl: 'http://localhost:3000',
        fetchFn: fetchMock,
        EventSourceClass: MockEventSource,
      });
      await consumer.connect();
      await new Promise(r => setTimeout(r, 20));

      consumer.onEntityUpdated(() => {
        throw new Error('Simulated delta handler crash');
      });

      expect(() => {
        (consumer as any).handleEvent({
          eventId: 'evt-crash',
          eventType: V12EventType.ENTITY_CREATED,
          sequence: 101,
          entityId: 'agent-crash',
          entityType: V12EntityType.PERSON,
          payload: { id: 'agent-crash' },
        });
      }).toThrow('Simulated delta handler crash');

      // Sequence must be rolled back to 100, not falsely left at 101
      expect(consumer.getSequence()).toBe(100);
    });

    it('preserves semantics for duplicate, out-of-order, and sequence-gap events', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ version: 'v12', sequence: 100, entities: {} }),
      });
      const consumer = new WorldStateConsumer({
        companyId: 'company-52a',
        apiBaseUrl: 'http://localhost:3000',
        fetchFn: fetchMock,
        EventSourceClass: MockEventSource,
      });
      await consumer.connect();
      await new Promise(r => setTimeout(r, 20));
      const es = (consumer as any).eventSource as MockEventSource;

      const updateSpy = jest.fn();
      consumer.onEntityUpdated(updateSpy);

      // Duplicate event (sequence 100 <= 100)
      es.emitMessage({
        eventId: 'evt-dup',
        eventType: V12EventType.ENTITY_CREATED,
        sequence: 100,
        entityId: 'agent-dup',
        payload: { id: 'agent-dup' },
      });
      expect(consumer.getSequence()).toBe(100);
      expect(updateSpy).not.toHaveBeenCalled();

      // Out-of-order event (sequence 95 < 100)
      es.emitMessage({
        eventId: 'evt-old',
        eventType: V12EventType.ENTITY_CREATED,
        sequence: 95,
        entityId: 'agent-old',
        payload: { id: 'agent-old' },
      });
      expect(consumer.getSequence()).toBe(100);
      expect(updateSpy).not.toHaveBeenCalled();

      // Sequence gap event (sequence 105 > 100 + 1)
      fetchMock.mockClear();
      es.emitMessage({
        eventId: 'evt-gap',
        eventType: V12EventType.ENTITY_CREATED,
        sequence: 105,
        entityId: 'agent-gap',
        payload: { id: 'agent-gap' },
      });
      // Gap triggers reconcile, does not advance sequence to 105
      expect(consumer.getState()).toBe(ConnectionState.LOADING_SNAPSHOT);
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});

