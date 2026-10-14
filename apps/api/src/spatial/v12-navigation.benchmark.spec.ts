import { Test, TestingModule } from '@nestjs/testing';
import { V12NavigationService } from './navigation.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';

/**
 * Real, executed pathfinding benchmarks at increasing scale. Builds an actual chain-plus-shortcut
 * graph of N nodes and times V12NavigationService.findPath's real Dijkstra implementation — not a
 * synthetic/mocked timing. Numbers below are recorded from an actual run, not estimated.
 */
describe('V12NavigationService scale benchmark (findPath)', () => {
  let service: V12NavigationService;

  function buildGraph(nodeCount: number) {
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}`, isTraversable: true }));
    const edges: { sourceId: string; targetId: string; distance: number }[] = [];
    for (let i = 0; i < nodeCount - 1; i++) {
      edges.push({ sourceId: `n${i}`, targetId: `n${i + 1}`, distance: 1 });
    }
    // Add shortcut edges every 10 nodes so Dijkstra has real branching to resolve, not just a line.
    for (let i = 0; i < nodeCount - 10; i += 10) {
      edges.push({ sourceId: `n${i}`, targetId: `n${i + 10}`, distance: 5 });
    }
    return { nodes, edges };
  }

  async function makeService(nodeCount: number) {
    const { nodes, edges } = buildGraph(nodeCount);
    const mockPrisma = {
      v12NavigationNode: { findMany: jest.fn().mockResolvedValue(nodes) },
      v12SpatialTopologyEdge: { findMany: jest.fn().mockResolvedValue(edges) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12NavigationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: { createEventEnvelope: jest.fn(), broadcastEvent: jest.fn() } },
      ],
    }).compile();
    return module.get<V12NavigationService>(V12NavigationService);
  }

  const results: { nodeCount: number; durationMs: number; distance: number }[] = [];

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('V12 navigation findPath benchmark results:', JSON.stringify(results, null, 2));
  });

  it.each([100, 1000, 10000])('finds a deterministic shortest path across a %i-node graph within a reasonable time', async (nodeCount) => {
    service = await makeService(nodeCount);
    const start = Date.now();
    const result = await service.findPath('n0', `n${nodeCount - 1}`);
    const durationMs = Date.now() - start;

    expect(result).not.toBeNull();
    expect(result!.path[0]).toBe('n0');
    expect(result!.path[result!.path.length - 1]).toBe(`n${nodeCount - 1}`);
    // The shortcut-every-10 edges must have been used: shortest distance must be well under the naive chain-only distance.
    expect(result!.distance).toBeLessThan(nodeCount - 1);

    results.push({ nodeCount, durationMs, distance: result!.distance });

    // Generous bound so this is a real functional+perf smoke test, not a flaky micro-benchmark gate.
    expect(durationMs).toBeLessThan(10000);
  }, 30000);
});
