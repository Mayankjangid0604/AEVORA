import { WorldSnapshot, WorldEntity, V12EntityId } from '../world-state';
import { V12EventEnvelope, V12EventType } from '../events';

export enum ConnectionState {
  INITIALIZING = 'INITIALIZING',
  LOADING_SNAPSHOT = 'LOADING_SNAPSHOT',
  SYNCHRONIZED = 'SYNCHRONIZED',
  STREAMING = 'STREAMING',
  RECONCILING = 'RECONCILING',
  DEGRADED = 'DEGRADED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

export interface ConsumerConfig {
  companyId: string;
  apiBaseUrl: string;
  authToken?: string;
  /** Extra request headers, e.g. the Aevora `x-company-id` context header. */
  headers?: Record<string, string>;
  /**
   * EventSource cannot send headers. When provided, a short-lived `purpose: 'sse'` token is fetched
   * for each stream connection instead of placing the session JWT in the URL.
   */
  streamTokenProvider?: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  EventSourceClass?: any; // To allow injecting polyfill for tests
}

export class WorldStateConsumer {
  private state: ConnectionState = ConnectionState.INITIALIZING;
  private config: ConsumerConfig;
  
  private sequence = 0;
  private version = '';
  private entities = new Map<V12EntityId, WorldEntity>();
  private topology: any[] = [];
  private navigationNodes: any[] = [];
  private movementStates = new Map<string, any>();
  
  private eventSource: EventSource | null = null;
  
  // Listeners for testing or driving the renderer
  private onStateChangeHandlers: ((state: ConnectionState) => void)[] = [];
  private onEntityUpdatedHandlers: ((entity: WorldEntity) => void)[] = [];
  private onEntityRemovedHandlers: ((id: V12EntityId) => void)[] = [];

  constructor(config: ConsumerConfig) {
    this.config = {
      fetchFn: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
      EventSourceClass: typeof EventSource !== 'undefined' ? EventSource : undefined,
      ...config
    };
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getSequence(): number {
    return this.sequence;
  }
  
  public getEntities(): Map<V12EntityId, WorldEntity> {
    return this.entities;
  }
  
  public getEntity(id: V12EntityId): WorldEntity | undefined {
    return this.entities.get(id);
  }

  public getTopology() {
    return this.topology;
  }

  public getNavigationNodes() {
    return this.navigationNodes;
  }

  public getMovementStates() {
    return this.movementStates;
  }

  public onStateChange(handler: (state: ConnectionState) => void) {
    this.onStateChangeHandlers.push(handler);
  }
  
  public onEntityUpdated(handler: (entity: WorldEntity) => void) {
    this.onEntityUpdatedHandlers.push(handler);
  }
  
  public onEntityRemoved(handler: (id: V12EntityId) => void) {
    this.onEntityRemovedHandlers.push(handler);
  }

  private setState(newState: ConnectionState) {
    this.state = newState;
    this.onStateChangeHandlers.forEach(h => h(newState));
  }

  public async connect(): Promise<void> {
    if (this.state === ConnectionState.STREAMING || this.state === ConnectionState.LOADING_SNAPSHOT) {
      return;
    }
    await this.reconcile();
  }
  
  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setState(ConnectionState.DISCONNECTED);
  }

  private async reconcile(): Promise<void> {
    this.disconnect();
    this.setState(ConnectionState.RECONCILING);
    this.setState(ConnectionState.LOADING_SNAPSHOT);
    
    try {
      if (!this.config.fetchFn) {
        throw new Error('fetch is not defined');
      }
      
      const headers: Record<string, string> = { ...(this.config.headers || {}) };
      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }
      
      const response = await this.config.fetchFn(
        `${this.config.apiBaseUrl}/world-state/snapshot/${this.config.companyId}`,
        { headers }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to load snapshot: ${response.status}`);
      }
      
      const snapshot: WorldSnapshot = await response.json();
      
      this.applySnapshot(snapshot);
      
      this.setState(ConnectionState.SYNCHRONIZED);
      await this.connectStream();
      
    } catch (err) {
      this.setState(ConnectionState.ERROR);
      // Wait and retry could be implemented here
    }
  }

  private applySnapshot(snapshot: WorldSnapshot) {
    this.sequence = snapshot.sequence || 0;
    this.version = snapshot.version || 'v12';
    
    this.entities.clear();
    
    if (snapshot.entities) {
      for (const [id, entity] of Object.entries(snapshot.entities)) {
        this.entities.set(id, entity);
        this.onEntityUpdatedHandlers.forEach(h => h(entity));
      }
    }

    if (snapshot.topology) {
      this.topology = snapshot.topology;
    }

    if (snapshot.navigationNodes) {
      this.navigationNodes = snapshot.navigationNodes;
    }

    if (snapshot.movementStates) {
      for (const [id, state] of Object.entries(snapshot.movementStates)) {
        this.movementStates.set(id, state);
      }
    }
  }

  private async connectStream() {
    if (!this.config.EventSourceClass) {
      this.setState(ConnectionState.ERROR);
      throw new Error('EventSource is not defined');
    }
    
    let url = `${this.config.apiBaseUrl}/world-state/stream/${this.config.companyId}`;
    if (this.config.streamTokenProvider) {
      const streamToken = await this.config.streamTokenProvider();
      if (!streamToken) throw new Error('Stream token unavailable');
      url += `?token=${encodeURIComponent(streamToken)}`;
    } else if (this.config.authToken) {
      url += `?token=${this.config.authToken}`;
    }
    
    this.eventSource = new this.config.EventSourceClass(url);
    
    this.eventSource!.onopen = () => {
      this.setState(ConnectionState.STREAMING);
    };
    
    this.eventSource!.onmessage = (event) => {
      try {
        const envelope: V12EventEnvelope = JSON.parse(event.data);
        if (!envelope || typeof envelope !== 'object') throw new Error('Invalid envelope format');
        if (typeof envelope.sequence !== 'number' || isNaN(envelope.sequence)) throw new Error('Missing or invalid sequence');
        if (!envelope.eventType || typeof envelope.eventType !== 'string') throw new Error('Missing eventType');
        if (!envelope.entityId || typeof envelope.entityId !== 'string') throw new Error('Missing entityId');
        this.handleEvent(envelope);
      } catch (err) {
        console.error('Failed to parse incoming event or invalid schema', err);
      }
    };
    
    this.eventSource!.onerror = (err) => {
      // Typically EventSource auto-reconnects, but if we lose sequence we need a snapshot
      // Let's go degraded or disconnect
      this.disconnect();
      this.setState(ConnectionState.DEGRADED);
      // In production, we'd add exponential backoff before calling reconcile()
      setTimeout(() => this.reconcile(), 1000);
    };
  }

  private handleEvent(envelope: V12EventEnvelope) {
    if (this.state !== ConnectionState.STREAMING && this.state !== ConnectionState.SYNCHRONIZED) {
      return;
    }
    
    // Company Isolation Check (assuming envelope might carry aggregateId or we check context implicitly, 
    // but the SSE endpoint should strictly scope it. We could enforce verification if envelope had companyId)

    // Sequence checks
    const incomingSeq = envelope.sequence;
    if (incomingSeq <= this.sequence) {
      // Duplicate or old event, ignore
      return;
    }
    
    if (incomingSeq > this.sequence + 1) {
      // Sequence gap detected
      this.reconcile();
      return;
    }
    
    // Apply valid event
    this.applyEventDelta(envelope);
    this.sequence = incomingSeq;
  }

  private applyEventDelta(envelope: V12EventEnvelope) {
    const { eventType, entityId, payload } = envelope;

    // History anchors carry no live delta; their sequence is consumed by handleEvent.
    if (eventType === V12EventType.WORLD_BASELINE) {
      return;
    }

    if (eventType === V12EventType.ENTITY_DELETED) {
      this.entities.delete(entityId);
      this.onEntityRemovedHandlers.forEach(h => h(entityId));
      return;
    }

    if (eventType === V12EventType.ENTITY_CREATED) {
      const entity = payload as WorldEntity;
      this.entities.set(entityId, entity);
      this.onEntityUpdatedHandlers.forEach(h => h(entity));
      return;
    }

    // For update events
    const existing = this.entities.get(entityId);
    if (!existing) {
      // We don't have the entity. We could just construct it or request it.
      // If it's a gap in state but not sequence, maybe we should reconcile
      if (eventType === V12EventType.ENTITY_UPDATED) {
         // Create if missing, but typically we should have it.
         this.entities.set(entityId, payload as WorldEntity);
         this.onEntityUpdatedHandlers.forEach(h => h(payload as WorldEntity));
      }
      return;
    }

    // Merge updates
    if (eventType === V12EventType.ENTITY_UPDATED) {
      const updated = { ...existing, ...payload } as WorldEntity;
      this.entities.set(entityId, updated);
      this.onEntityUpdatedHandlers.forEach(h => h(updated));
    } else if (eventType === V12EventType.TRANSFORM_UPDATED) {
      const updated = { ...existing, transform: { ...existing.transform, ...payload } } as WorldEntity;
      this.entities.set(entityId, updated);
      this.onEntityUpdatedHandlers.forEach(h => h(updated));
    } else if (eventType === V12EventType.VISIBILITY_UPDATED) {
      const updated = { ...existing, visibility: { ...existing.visibility, ...payload } } as WorldEntity;
      this.entities.set(entityId, updated);
      this.onEntityUpdatedHandlers.forEach(h => h(updated));
    } else if (eventType === 'MOVEMENT_STARTED' || eventType === 'MOVEMENT_UPDATED' || eventType === 'MOVEMENT_BLOCKED' || eventType === 'MOVEMENT_ARRIVED') {
      const payloadAny = payload as any;
      if (payloadAny.movementState) {
         this.movementStates.set(entityId, payloadAny.movementState);
      }
    }
  }
}
