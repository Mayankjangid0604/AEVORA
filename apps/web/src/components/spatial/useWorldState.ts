'use client';

import { useMemo, useState, useEffect, useSyncExternalStore } from 'react';
import {
  WorldStateConsumer,
  ConnectionState,
  type WorldSnapshot,
  type WorldEntity,
  type V12EntityId,
} from '@aevora/shared';

export interface UseWorldStateOptions {
  companyId: string;
  initialSnapshot?: WorldSnapshot | null;
}

export interface UseWorldStateReturn {
  connectionState: ConnectionState;
  sequence: number;
  entities: Map<V12EntityId, WorldEntity>;
  selectedEntity: WorldEntity | null;
  setSelectedEntity: (entity: WorldEntity | null) => void;
  reconnect: () => Promise<void>;
  errorMessage: string | null;
}

interface WorldStateSnapshot {
  connectionState: ConnectionState;
  sequence: number;
  entities: Map<V12EntityId, WorldEntity>;
  errorMessage: string | null;
}

/**
 * External store orchestrating WorldStateConsumer lifecycle and React subscriptions.
 * Adheres to React 18/19 subscription and snapshot requirements via useSyncExternalStore.
 */
class WorldStateStore {
  private companyId: string;
  private initialSnapshot?: WorldSnapshot | null;
  private listeners = new Set<() => void>();
  private snapshot: WorldStateSnapshot;
  private consumer: WorldStateConsumer | null = null;
  private isConnecting = false;
  private isDisposed = false;

  constructor(companyId: string, initialSnapshot?: WorldSnapshot | null) {
    this.companyId = companyId;
    this.initialSnapshot = initialSnapshot;

    const initialMap = new Map<V12EntityId, WorldEntity>();
    if (initialSnapshot?.entities) {
      for (const [id, entity] of Object.entries(initialSnapshot.entities)) {
        initialMap.set(id, entity);
      }
    }

    this.snapshot = {
      connectionState: initialSnapshot ? ConnectionState.SYNCHRONIZED : ConnectionState.INITIALIZING,
      sequence: initialSnapshot?.sequence ?? 0,
      entities: initialMap,
      errorMessage: null,
    };
  }

  public getSnapshot = (): WorldStateSnapshot => {
    return this.snapshot;
  };

  private update(partial: Partial<WorldStateSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.isDisposed = false;
    this.listeners.add(listener);

    if (this.listeners.size === 1 && !this.consumer && !this.isConnecting) {
      this.initConsumer();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        if (this.consumer) {
          this.consumer.disconnect();
          this.consumer = null;
        }
      }
    };
  };

  public reconnect = async (): Promise<void> => {
    await this.initConsumer();
  };

  private async initConsumer(): Promise<void> {
    if (!this.companyId) return;

    this.isConnecting = true;
    try {
      // Fetch stream token and API base URL via BFF
      const tokenRes = await fetch('/api/bff/stream-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-aevora-company': this.companyId,
        },
      });

      if (!tokenRes.ok) {
        throw new Error(`Failed to obtain stream token: HTTP ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      const apiBaseUrl = tokenData.apiBaseUrl || 'http://localhost:13000';

      if (this.isDisposed) return;

      // Clean up any existing consumer instance
      if (this.consumer) {
        this.consumer.disconnect();
        this.consumer = null;
      }

      const companyId = this.companyId;

      // Configure WorldStateConsumer with BFF-backed snapshot fetch and stream token provider
      const consumer = new WorldStateConsumer({
        companyId,
        apiBaseUrl,
        fetchFn: async (input: RequestInfo | URL, init?: RequestInit) => {
          const urlStr = typeof input === 'string' ? input : input.toString();
          // Route snapshot reconciliation requests through the authenticated BFF
          if (urlStr.includes('/world-state/snapshot/')) {
            return fetch(`/api/bff/spatial-snapshot?companyId=${encodeURIComponent(companyId)}`, {
              ...init,
              headers: {
                ...(init?.headers || {}),
                'x-aevora-company': companyId,
              },
            });
          }
          return fetch(input, init);
        },
        streamTokenProvider: async () => {
          try {
            const res = await fetch('/api/bff/stream-token', {
              method: 'POST',
              headers: {
                'x-aevora-company': companyId,
              },
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data.token;
          } catch {
            return null;
          }
        },
        EventSourceClass: typeof window !== 'undefined' ? window.EventSource : undefined,
      });

      // Synchronize internal consumer entity map with initial snapshot if present
      if (this.initialSnapshot?.entities) {
        const consumerEntities = consumer.getEntities();
        for (const [id, entity] of Object.entries(this.initialSnapshot.entities)) {
          consumerEntities.set(id, entity);
        }
      }

      consumer.onStateChange((state) => {
        if (this.isDisposed) return;
        this.update({
          connectionState: state,
          sequence: consumer.getSequence(),
          errorMessage: null,
        });
      });

      consumer.onEntityUpdated(() => {
        if (this.isDisposed) return;
        this.update({
          entities: new Map(consumer.getEntities()),
          sequence: consumer.getSequence(),
        });
      });

      consumer.onEntityRemoved(() => {
        if (this.isDisposed) return;
        this.update({
          entities: new Map(consumer.getEntities()),
          sequence: consumer.getSequence(),
        });
      });

      this.consumer = consumer;
      this.isConnecting = false;
      this.update({ errorMessage: null });

      await consumer.connect();
    } catch (err: unknown) {
      if (this.isDisposed) return;
      this.isConnecting = false;
      this.update({
        connectionState: ConnectionState.ERROR,
        errorMessage: err instanceof Error ? err.message : 'Connection failed',
      });
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.consumer) {
      this.consumer.disconnect();
      this.consumer = null;
    }
    this.listeners.clear();
  }
}

/**
 * React hook binding the authoritative WorldStateConsumer to React state.
 * Uses an external store subscription pattern via useSyncExternalStore to avoid
 * synchronous cascading renders within effects and maintain concurrency safety.
 */
export function useWorldState({ companyId, initialSnapshot }: UseWorldStateOptions): UseWorldStateReturn {
  const store = useMemo(() => new WorldStateStore(companyId, initialSnapshot), [companyId, initialSnapshot]);

  useEffect(() => {
    return () => {
      store.dispose();
    };
  }, [store]);

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  const [selectedEntity, setSelectedEntity] = useState<WorldEntity | null>(null);

  return {
    connectionState: snapshot.connectionState,
    sequence: snapshot.sequence,
    entities: snapshot.entities,
    selectedEntity,
    setSelectedEntity,
    reconnect: store.reconnect,
    errorMessage: snapshot.errorMessage,
  };
}
