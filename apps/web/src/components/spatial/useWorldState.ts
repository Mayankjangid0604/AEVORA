'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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

/**
 * React hook binding the authoritative WorldStateConsumer to React state.
 * Consumes the initial server-provided snapshot immediately and establishes
 * an authenticated SSE stream using ephemeral 60s stream-tokens via the BFF.
 */
export function useWorldState({ companyId, initialSnapshot }: UseWorldStateOptions): UseWorldStateReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    initialSnapshot ? ConnectionState.SYNCHRONIZED : ConnectionState.INITIALIZING
  );
  const [sequence, setSequence] = useState<number>(initialSnapshot?.sequence ?? 0);
  const [entities, setEntities] = useState<Map<V12EntityId, WorldEntity>>(() => {
    const map = new Map<V12EntityId, WorldEntity>();
    if (initialSnapshot?.entities) {
      for (const [id, entity] of Object.entries(initialSnapshot.entities)) {
        map.set(id, entity);
      }
    }
    return map;
  });
  const [selectedEntity, setSelectedEntity] = useState<WorldEntity | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const consumerRef = useRef<WorldStateConsumer | null>(null);

  const initConsumer = useCallback(async () => {
    if (!companyId) return;

    try {
      setErrorMessage(null);

      // Fetch stream token and API base URL via BFF
      const tokenRes = await fetch('/api/bff/stream-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-aevora-company': companyId,
        },
      });

      if (!tokenRes.ok) {
        throw new Error(`Failed to obtain stream token: HTTP ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      const apiBaseUrl = tokenData.apiBaseUrl || 'http://localhost:13000';

      // Clean up any existing consumer instance
      if (consumerRef.current) {
        consumerRef.current.disconnect();
      }

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
      if (initialSnapshot?.entities) {
        const consumerEntities = consumer.getEntities();
        for (const [id, entity] of Object.entries(initialSnapshot.entities)) {
          consumerEntities.set(id, entity);
        }
      }

      consumer.onStateChange((state) => {
        setConnectionState(state);
        setSequence(consumer.getSequence());
      });

      consumer.onEntityUpdated((_entity) => {
        setEntities(new Map(consumer.getEntities()));
        setSequence(consumer.getSequence());
      });

      consumer.onEntityRemoved((_id) => {
        setEntities(new Map(consumer.getEntities()));
        setSequence(consumer.getSequence());
      });

      consumerRef.current = consumer;
      await consumer.connect();
    } catch (err: any) {
      setConnectionState(ConnectionState.ERROR);
      setErrorMessage(err.message || 'Connection failed');
    }
  }, [companyId, initialSnapshot]);

  useEffect(() => {
    initConsumer();

    return () => {
      if (consumerRef.current) {
        consumerRef.current.disconnect();
        consumerRef.current = null;
      }
    };
  }, [initConsumer]);

  return {
    connectionState,
    sequence,
    entities,
    selectedEntity,
    setSelectedEntity,
    reconnect: initConsumer,
    errorMessage,
  };
}
