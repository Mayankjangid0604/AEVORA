// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState, V12EntityType, V12EventType, type WorldEntity, type WorldSnapshot } from '@aevora/shared';
import { useWorldState, type UseWorldStateOptions, type UseWorldStateReturn } from '@/components/spatial/useWorldState';

/**
 * Deterministic MockEventSource for testing lifecycle and message events.
 */
class MockEventSource {
  public static instances: MockEventSource[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;
  public closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  public open(): void {
    if (!this.closed && this.onopen) {
      this.onopen();
    }
  }

  public emit(data: unknown): void {
    if (!this.closed && this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  public triggerError(err: unknown): void {
    if (!this.closed && this.onerror) {
      this.onerror(err);
    }
  }

  public close(): void {
    this.closed = true;
  }
}

/**
 * Lightweight, dependency-free React hook test harness utilizing React 19 createRoot + act.
 */
function renderHook<TProps extends object, TResult>(
  hook: (props: TProps) => TResult,
  initialProps: TProps,
  wrapper?: (children: React.ReactNode) => React.ReactElement
) {
  const result = { current: undefined as unknown as TResult };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function HookTester(props: TProps) {
    result.current = hook(props);
    return null;
  }

  act(() => {
    root.render(
      wrapper ? wrapper(<HookTester {...initialProps} />) : <HookTester {...initialProps} />
    );
  });

  return {
    result,
    rerender: (newProps: TProps) => {
      act(() => {
        root.render(
          wrapper ? wrapper(<HookTester {...newProps} />) : <HookTester {...newProps} />
        );
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('AEVORA — useWorldState Lifecycle Verification Suite', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    (window as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;

    fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/bff/stream-token')) {
        return new Response(
          JSON.stringify({
            token: 'stream-token-xyz',
            apiBaseUrl: 'http://localhost:3000',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url.includes('/api/bff/spatial-snapshot') || url.includes('/world-state/snapshot/')) {
        return new Response(
          JSON.stringify({
            version: 'v12',
            sequence: 100,
            timestamp: Date.now(),
            entities: {
              'agent-1': {
                id: 'agent-1',
                type: V12EntityType.PERSON,
                name: 'Agent One',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('1. Initial state with a supplied server snapshot is SYNCHRONIZED synchronously', () => {
    const initialSnapshot = {
      version: 'v12',
      sequence: 50,
      timestamp: Date.now(),
      entities: {
        'room-alpha': {
          id: 'room-alpha',
          type: V12EntityType.ROOM,
          name: 'Executive Boardroom',
        } as unknown as WorldEntity,
      },
    } as unknown as WorldSnapshot;

    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-alpha', initialSnapshot }
    );

    // Synchronous initial snapshot check
    expect(result.current.connectionState).toBe(ConnectionState.SYNCHRONIZED);
    expect(result.current.sequence).toBe(50);
    expect(result.current.entities.has('room-alpha')).toBe(true);
    expect(result.current.entities.get('room-alpha')?.name).toBe('Executive Boardroom');
    expect(result.current.errorMessage).toBeNull();

    unmount();
  });

  it('2. Initial state without a snapshot defaults to INITIALIZING with empty entity map', () => {
    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-beta', initialSnapshot: null }
    );

    expect(result.current.connectionState).toBe(ConnectionState.INITIALIZING);
    expect(result.current.sequence).toBe(0);
    expect(result.current.entities.size).toBe(0);
    expect(result.current.errorMessage).toBeNull();

    unmount();
  });

  it('3. Establishes consumer connection and publishes state transitions up to STREAMING', async () => {
    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-gamma' }
    );

    // Allow initial async fetch (stream token & snapshot) to settle
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(MockEventSource.instances.length).toBe(1);
    const eventSource = MockEventSource.instances[0]!;

    // Trigger SSE connection open
    act(() => {
      eventSource.open();
    });

    expect(result.current.connectionState).toBe(ConnectionState.STREAMING);
    expect(result.current.sequence).toBe(100);
    expect(result.current.entities.has('agent-1')).toBe(true);
    expect(result.current.errorMessage).toBeNull();

    unmount();
  });

  it('4. Handles real-time entity updates, additions, and removals via delta events', async () => {
    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-delta' }
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const es = MockEventSource.instances[0]!;
    act(() => {
      es.open();
    });

    expect(result.current.entities.size).toBe(1);

    // Entity Created (sequence 101)
    act(() => {
      es.emit({
        sequence: 101,
        eventType: V12EventType.ENTITY_CREATED,
        entityId: 'agent-2',
        payload: { id: 'agent-2', type: V12EntityType.PERSON, name: 'Agent Two' },
      });
    });

    expect(result.current.sequence).toBe(101);
    expect(result.current.entities.has('agent-2')).toBe(true);
    expect(result.current.entities.get('agent-2')?.name).toBe('Agent Two');

    // Entity Updated (sequence 102)
    act(() => {
      es.emit({
        sequence: 102,
        eventType: V12EventType.ENTITY_UPDATED,
        entityId: 'agent-2',
        payload: { name: 'Agent Two (Promoted)' },
      });
    });

    expect(result.current.sequence).toBe(102);
    expect(result.current.entities.get('agent-2')?.name).toBe('Agent Two (Promoted)');

    // Entity Deleted (sequence 103)
    act(() => {
      es.emit({
        sequence: 103,
        eventType: V12EventType.ENTITY_DELETED,
        entityId: 'agent-1',
      });
    });

    expect(result.current.sequence).toBe(103);
    expect(result.current.entities.has('agent-1')).toBe(false);

    unmount();
  });

  it('5. Exposes ERROR connectionState and human-readable errorMessage on BFF failure', async () => {
    fetchMock.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ message: 'Unauthorized stream token request' }), {
        status: 401,
      });
    });

    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-fail' }
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe(ConnectionState.ERROR);
    expect(result.current.errorMessage).toContain('Failed to obtain stream token: HTTP 401');

    unmount();
  });

  it('6. Manual reconnect cleans up the previous consumer and establishes a fresh connection', async () => {
    // Start with a failed connection
    fetchMock.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ message: 'Service Temporarily Unavailable' }), {
        status: 503,
      });
    });

    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-reconnect' }
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe(ConnectionState.ERROR);

    // Next fetch attempts succeed
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/bff/stream-token')) {
        return new Response(
          JSON.stringify({ token: 'new-token-456', apiBaseUrl: 'http://localhost:3000' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          version: 'v12',
          sequence: 200,
          timestamp: Date.now(),
          entities: {
            'restored-node': { id: 'restored-node', type: V12EntityType.ROOM, name: 'Main Lobby' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    // Execute manual reconnect
    await act(async () => {
      await result.current.reconnect();
      await Promise.resolve();
      await Promise.resolve();
    });

    const activeEs = MockEventSource.instances[MockEventSource.instances.length - 1]!;
    act(() => {
      activeEs.open();
    });

    expect(result.current.connectionState).toBe(ConnectionState.STREAMING);
    expect(result.current.sequence).toBe(200);
    expect(result.current.entities.has('restored-node')).toBe(true);
    expect(result.current.errorMessage).toBeNull();

    unmount();
  });

  it('7. Unmount cleanup closes the active EventSource and prevents stale updates', async () => {
    const { unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-unmount' }
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(MockEventSource.instances.length).toBe(1);
    const es = MockEventSource.instances[0]!;
    expect(es.closed).toBe(false);

    // Unmount hook
    unmount();

    // EventSource must be deterministically closed on unmount
    expect(es.closed).toBe(true);

    // Late emission after unmount should be cleanly ignored without throwing
    expect(() => {
      es.emit({
        sequence: 999,
        eventType: V12EventType.ENTITY_CREATED,
        entityId: 'ghost',
        payload: { id: 'ghost' },
      });
    }).not.toThrow();
  });

  it('8. React Strict Mode mount-unmount-remount cycle preserves subscription and stream recovery', async () => {
    const { result, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-strict' },
      (children) => <React.StrictMode>{children}</React.StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // In Strict Mode, the active instance should successfully open without being frozen in disposed state
    const activeEs = MockEventSource.instances[MockEventSource.instances.length - 1]!;
    act(() => {
      activeEs.open();
    });

    expect(result.current.connectionState).toBe(ConnectionState.STREAMING);
    expect(result.current.sequence).toBe(100);
    expect(result.current.entities.has('agent-1')).toBe(true);

    unmount();
  });

  it('9. Supports multiple subscribers with shared notification semantics', async () => {
    let sub1Result: UseWorldStateReturn | undefined;
    let sub2Result: UseWorldStateReturn | undefined;

    function MultiSubscriberContainer({ companyId }: { companyId: string }) {
      sub1Result = useWorldState({ companyId });
      sub2Result = useWorldState({ companyId });
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<MultiSubscriberContainer companyId="comp-multi" />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sub1Result).toBeDefined();
    expect(sub2Result).toBeDefined();

    // Both subscribers should observe independent local selectedEntity state
    act(() => {
      sub1Result?.setSelectedEntity({ id: 'ent-a', type: V12EntityType.ROOM, name: 'A' } as unknown as WorldEntity);
    });

    expect(sub1Result?.selectedEntity?.id).toBe('ent-a');
    expect(sub2Result?.selectedEntity).toBeNull(); // Verifies per-hook local selection isolation

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('10. Rerendering with a different companyId isolates stores and cleans up previous connection', async () => {
    const { result, rerender, unmount } = renderHook(
      (props: UseWorldStateOptions) => useWorldState(props),
      { companyId: 'comp-original' }
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(MockEventSource.instances.length).toBe(1);
    const originalEs = MockEventSource.instances[0]!;

    // Rerender with a new companyId
    rerender({ companyId: 'comp-destination' });

    // Previous EventSource should be disconnected
    expect(originalEs.closed).toBe(true);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // New EventSource should be created for destination company
    expect(MockEventSource.instances.length).toBe(2);
    const newEs = MockEventSource.instances[1]!;
    expect(newEs.closed).toBe(false);

    act(() => {
      newEs.open();
    });

    expect(result.current.connectionState).toBe(ConnectionState.STREAMING);

    unmount();
  });
});
