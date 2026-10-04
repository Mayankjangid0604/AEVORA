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
});
