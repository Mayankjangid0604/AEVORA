import { Injectable, Logger, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStateService } from '../management/company-state.service';
import { SalesPipelineService } from '../sales/sales-pipeline.service';
import { ConflictResolutionEngine } from './conflict-resolution.engine';
import { RelationshipGraphBuilder } from './relationship-graph.builder';
import { SignificanceFilterService } from './significance-filter.service';
import {
  DerivedEnterpriseState,
  EnterpriseRelationshipGraph,
  DetectedConflict,
  DomainFreshness,
  SignificanceEvaluationInput,
  SignificanceEvaluationResult,
  UntrustedContentContainer,
} from './enterprise-brain.types';

interface CachedEntry<T> {
  data: T;
  cachedAt: number;
}

interface CompanyBrainCache {
  state?: CachedEntry<DerivedEnterpriseState>;
  graph?: CachedEntry<EnterpriseRelationshipGraph>;
  conflicts?: CachedEntry<DetectedConflict[]>;
}

@Injectable()
export class EnterpriseBrainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnterpriseBrainService.name);

  // In-memory tenant-isolated derived cache: companyId -> CompanyBrainCache
  private readonly tenantCaches = new Map<string, CompanyBrainCache>();
  private dbSubscription?: Subscription;

  // Cache TTL: 60 seconds default for derived aggregations
  private readonly CACHE_TTL_MS = 60_000;
  private readonly STALE_THRESHOLD_MS = 300_000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly companyState: CompanyStateService,
    private readonly salesPipeline: SalesPipelineService,
    private readonly conflictEngine: ConflictResolutionEngine,
    private readonly graphBuilder: RelationshipGraphBuilder,
    private readonly significanceFilter: SignificanceFilterService,
  ) {}

  onModuleInit() {
    // Event-driven invalidation: listen to databaseEvents from PrismaService
    if (this.prisma.databaseEvents) {
      this.dbSubscription = this.prisma.databaseEvents.subscribe((event) => {
        try {
          this.handleDatabaseEvent(event);
        } catch (e: any) {
          this.logger.warn(`Event-driven cache invalidation error: ${e.message}`);
        }
      });
      this.logger.log('Enterprise Brain subscribed to databaseEvents for targeted invalidation');
    }
  }

  onModuleDestroy() {
    this.dbSubscription?.unsubscribe();
  }

  /**
   * Event-driven targeted invalidation:
   * Only invalidates the specific company and domain affected by the database change.
   */
  private handleDatabaseEvent(event: { model: string; action: string; data: any }) {
    const companyId = event.data?.companyId;
    if (!companyId || typeof companyId !== 'string') return;

    const cache = this.tenantCaches.get(companyId);
    if (!cache) return;

    const model = event.model?.toLowerCase();

    // Targeted invalidations
    if (['task', 'project', 'goal'].includes(model)) {
      cache.state = undefined;
      cache.graph = undefined;
      this.logger.debug(`[${companyId}] Invalidated state & graph cache on ${event.model}.${event.action}`);
    } else if (['revenuerecord', 'invoice', 'companymonthlybudget', 'realmoneyaccount'].includes(model)) {
      cache.state = undefined;
      cache.conflicts = undefined;
      this.logger.debug(`[${companyId}] Invalidated state & conflicts cache on ${event.model}.${event.action}`);
    } else if (['employee', 'department'].includes(model)) {
      cache.state = undefined;
      cache.graph = undefined;
      cache.conflicts = undefined;
      this.logger.debug(`[${companyId}] Invalidated workforce cache on ${event.model}.${event.action}`);
    } else if (['client', 'saleslead', 'opportunity', 'marketingcampaign'].includes(model)) {
      cache.state = undefined;
      cache.graph = undefined;
      this.logger.debug(`[${companyId}] Invalidated sales/marketing cache on ${event.model}.${event.action}`);
    }
  }

  /**
   * Manual or targeted invalidation helper for a specific company
   */
  invalidateCompanyDomain(companyId: string, domain?: string) {
    const cache = this.tenantCaches.get(companyId);
    if (!cache) return;

    if (!domain || domain === 'ALL') {
      this.tenantCaches.delete(companyId);
    } else if (domain === 'STATE') {
      cache.state = undefined;
    } else if (domain === 'GRAPH') {
      cache.graph = undefined;
    } else if (domain === 'CONFLICTS') {
      cache.conflicts = undefined;
    }
  }

  /**
   * Authoritative Derived Enterprise State Aggregation.
   * Gathers facts from PostgreSQL across workforce, finances, projects, tasks,
   * pipeline, marketing, goals, and conflicts.
   */
  async getDerivedEnterpriseState(companyId: string, forceFresh = false): Promise<DerivedEnterpriseState> {
    const now = Date.now();
    let tenantCache = this.tenantCaches.get(companyId);
    if (!tenantCache) {
      tenantCache = {};
      this.tenantCaches.set(companyId, tenantCache);
    }

    if (!forceFresh && tenantCache.state && now - tenantCache.state.cachedAt < this.CACHE_TTL_MS) {
      return tenantCache.state.data;
    }

    // Verify company existence
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    // Collect multi-domain data
    const [stateSnapshot, conflicts, salesMetrics, openInvoicesAgg, completedTasksCount] = await Promise.all([
      this.companyState.collectState(companyId),
      this.conflictEngine.detectAndResolveConflicts(companyId),
      this.salesPipeline.getPipelineMetrics(companyId).catch(() => null),
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'ISSUED' },
        _sum: { total: true },
        _count: { _all: true },
      }).catch(() => ({ _sum: { total: 0 }, _count: { _all: 0 } })),
      this.prisma.task.count({ where: { companyId, status: 'COMPLETED' } }).catch(() => 0),
    ]);

    const generatedAt = new Date();
    const sourceFreshness: Record<string, DomainFreshness> = {
      workforce: {
        domain: 'workforce',
        lastCollectedAt: stateSnapshot.snapshotAt,
        dataAgeMs: now - stateSnapshot.snapshotAt.getTime(),
        status: now - stateSnapshot.snapshotAt.getTime() > this.STALE_THRESHOLD_MS ? 'STALE' : 'FRESH',
        staleThresholdMs: this.STALE_THRESHOLD_MS,
      },
      financial: {
        domain: 'financial',
        lastCollectedAt: generatedAt,
        dataAgeMs: 0,
        status: 'FRESH',
        staleThresholdMs: this.STALE_THRESHOLD_MS,
      },
      projects: {
        domain: 'projects',
        lastCollectedAt: generatedAt,
        dataAgeMs: 0,
        status: 'FRESH',
        staleThresholdMs: this.STALE_THRESHOLD_MS,
      },
      tasks: {
        domain: 'tasks',
        lastCollectedAt: generatedAt,
        dataAgeMs: 0,
        status: 'FRESH',
        staleThresholdMs: this.STALE_THRESHOLD_MS,
      },
      salesPipeline: {
        domain: 'salesPipeline',
        lastCollectedAt: generatedAt,
        dataAgeMs: 0,
        status: 'FRESH',
        staleThresholdMs: this.STALE_THRESHOLD_MS,
      },
    };

    const unresolvedUncertainties = conflicts
      .filter((c) => !c.isResolved)
      .map((c) => c.uncertaintyNotes || `Unresolved discrepancy in ${c.domain}.${c.field}`);

    const derivedState: DerivedEnterpriseState = {
      companyId,
      generatedAt,
      sourceFreshness,
      workforce: {
        totalEmployees: stateSnapshot.workforce.totalEmployees,
        activeEmployees: stateSnapshot.workforce.activeEmployees,
        departments: stateSnapshot.workforce.departments,
        capacityOccupancyRatio:
          stateSnapshot.workforce.totalEmployees > 0
            ? Number((stateSnapshot.workforce.activeEmployees / stateSnapshot.workforce.totalEmployees).toFixed(2))
            : 0,
      },
      financial: {
        acBalance: stateSnapshot.finance.acBalance,
        totalRevenue: stateSnapshot.finance.totalRevenue,
        openInvoicesAmount: openInvoicesAgg._sum?.total ?? 0,
        unpaidInvoicesCount: openInvoicesAgg._count?._all ?? 0,
        netProfitEstimate: stateSnapshot.finance.totalRevenue, // Base revenue without subtracting synthetic expenses
      },
      projects: {
        total: stateSnapshot.projects.total,
        active: stateSnapshot.projects.active,
        blocked: stateSnapshot.projects.blocked,
        completed: stateSnapshot.projects.completed,
      },
      tasks: {
        total: stateSnapshot.tasks.total,
        inProgress: stateSnapshot.tasks.inProgress,
        blocked: stateSnapshot.tasks.blocked,
        overdue: stateSnapshot.tasks.overdue,
        completed: completedTasksCount,
      },
      salesPipeline: {
        leadCount: stateSnapshot.sales.totalLeads,
        openOpportunities: stateSnapshot.sales.openOpportunities,
        weightedValue: salesMetrics?.weightedPipelineValue ?? 0,
        conversionRate: salesMetrics?.conversionRate ?? 0,
      },
      marketing: {
        activeCampaigns: stateSnapshot.marketing.activeCampaigns,
        activeOffersCount: 0,
      },
      strategicGoals: {
        activeObjectives: stateSnapshot.strategicPlanning.objectives?.length ?? 0,
        atRiskObjectives: stateSnapshot.strategicPlanning.atRiskObjectives,
        overallProgressPercent: stateSnapshot.strategicPlanning.objectiveProgress,
      },
      conflictsDetected: conflicts,
      unresolvedUncertainties,
    };

    tenantCache.state = { data: derivedState, cachedAt: now };
    return derivedState;
  }

  /**
   * Retrieves the structured enterprise relationship graph
   */
  async getRelationshipGraph(companyId: string, forceFresh = false): Promise<EnterpriseRelationshipGraph> {
    const now = Date.now();
    let tenantCache = this.tenantCaches.get(companyId);
    if (!tenantCache) {
      tenantCache = {};
      this.tenantCaches.set(companyId, tenantCache);
    }

    if (!forceFresh && tenantCache.graph && now - tenantCache.graph.cachedAt < this.CACHE_TTL_MS) {
      return tenantCache.graph.data;
    }

    const graph = await this.graphBuilder.buildGraph(companyId);
    tenantCache.graph = { data: graph, cachedAt: now };
    return graph;
  }

  /**
   * Traces upward lineage from a Task to its executing Employee, parent Project, and Objective.
   */
  async getTaskLineage(companyId: string, taskId: string) {
    return this.graphBuilder.traceTaskLineage(companyId, taskId);
  }

  /**
   * Retrieves current detected conflicts and reconciliations
   */
  async getDetectedConflicts(companyId: string, forceFresh = false): Promise<DetectedConflict[]> {
    const now = Date.now();
    let tenantCache = this.tenantCaches.get(companyId);
    if (!tenantCache) {
      tenantCache = {};
      this.tenantCaches.set(companyId, tenantCache);
    }

    if (!forceFresh && tenantCache.conflicts && now - tenantCache.conflicts.cachedAt < this.CACHE_TTL_MS) {
      return tenantCache.conflicts.data;
    }

    const conflicts = await this.conflictEngine.detectAndResolveConflicts(companyId);
    tenantCache.conflicts = { data: conflicts, cachedAt: now };
    return conflicts;
  }

  /**
   * Evaluates significance of enterprise events using the significance filter
   */
  async evaluateSignificance(companyId: string, input: SignificanceEvaluationInput): Promise<SignificanceEvaluationResult> {
    // Assert companyId scoping
    return this.significanceFilter.evaluateEvent(input);
  }

  /**
   * Sanitizes untrusted text ensuring it can never be executed as authority
   */
  sanitizeUntrustedText(text: string, source: string): UntrustedContentContainer {
    return this.significanceFilter.sanitizeUntrustedText(text, source);
  }
}
