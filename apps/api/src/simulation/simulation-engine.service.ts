import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentSchedulerService } from '../agent/agent-scheduler.service';
import { WorkCycleService } from '../agent/work-cycle.service';
import { SimulationStatus, EventStatus } from '@prisma/client';
import { BusinessLoopService, WORK_BLOCKING_FEATURES } from './business-loop.service';

@Injectable()
export class SimulationEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationEngineService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessingTick = false;
  private eventsRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentSchedulerService)) private readonly schedulerService: AgentSchedulerService,
    @Inject(forwardRef(() => WorkCycleService)) private readonly workCycleService: WorkCycleService,
    private readonly businessLoop: BusinessLoopService,
  ) {}

  onModuleInit() {
    this.logger.log('Starting Simulation Engine background loop...');
    // We run the tick evaluation loop at a fixed real-time interval (e.g. 1000ms base)
    // Real time only (#45): each tick advances the simulation clock by one second.
    this.intervalId = setInterval(() => this.tick(), 1000).unref();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async tick() {
    if (this.isProcessingTick) return;
    this.isProcessingTick = true;

    try {
      // Every RUNNING simulation (one per company). findFirst() without a filter used to pick an old STOPPED
      // row, so the clock (and the business loop it drives) silently never advanced.
      const running = await this.prisma.simulationState.findMany({ where: { status: SimulationStatus.RUNNING }, orderBy: { updatedAt: 'desc' } });
      if (!running.length) return; // Do nothing if paused or stopped

      const state = running[0];
      let newSimTime = state.simulationTime;
      for (const s of running) {
        // #45: always real time (1 s per tick); speed-up was removed, speedMultiplier is ignored
        const t = new Date(s.simulationTime.getTime() + 1000);
        await this.prisma.simulationState.update({ where: { id: s.id }, data: { currentTick: s.currentTick + 1, simulationTime: t } });
        if (s === state) newSimTime = t;
      }

      // Business loop (survival → lead gen → sales → delivery → payments), background + throttled
      this.businessLoop.runIfDue();

      // Agent work cycles call the local model (often minutes). They run beside the clock, never inside the
      // tick — otherwise the simulation clock and the business loop froze while one agent was thinking.
      if (!this.eventsRunning) {
        this.eventsRunning = true;
        this.scheduleWorkCycles(newSimTime)
          .then(() => this.processEvents(newSimTime, state.id))
          .catch((e) => this.logger.error(`Work cycle processing failed: ${e.message}`))
          .finally(() => { this.eventsRunning = false; });
      }

    } catch (err) {
      this.logger.error('Error during simulation tick:', err);
    } finally {
      this.isProcessingTick = false;
    }
  }

  /** Companies whose agents must not work (survival shutdown sets these kill switches), plus parked venture staff. */
  private async workBlocks() {
    const switches = await this.prisma.killSwitchConfig.findMany({
      where: { feature: { in: WORK_BLOCKING_FEATURES }, isDisabled: true },
      select: { companyId: true },
    });
    const parked = await this.prisma.ventureTeam.findMany({
      where: { venture: { status: { in: ['PAUSED', 'CLOSED', 'FAILED'] } } },
      select: { employeeId: true },
    });
    return {
      global: switches.some((s) => s.companyId === null),
      companies: new Set(switches.map((s) => s.companyId).filter(Boolean) as string[]),
      employees: new Set(parked.map((p) => p.employeeId)),
    };
  }

  private async scheduleWorkCycles(currentTime: Date) {
    const blocks = await this.workBlocks();
    if (blocks.global) return;
    const agents = (await this.schedulerService.getEligibleAgents()).filter(
      (a) => !blocks.companies.has(a.employee.companyId) && !blocks.employees.has(a.employeeId),
    );

    for (const agent of agents) {
      // Check if already an event for this agent in SCHEDULED state
      const existing = await this.prisma.simulationEvent.findFirst({
        where: {
          type: 'EMPLOYEE_WORK_CYCLE',
          status: EventStatus.SCHEDULED,
          payload: { path: ['agentId'], equals: agent.id }
        }
      });

      if (!existing) {
        await this.prisma.simulationEvent.create({
          data: {
            type: 'EMPLOYEE_WORK_CYCLE',
            simulationTime: currentTime,
            priority: 10,
            payload: { agentId: agent.id }
          }
        });
      }
    }
  }

  private async processEvents(currentTime: Date, stateId: string) {
    const events = await this.prisma.simulationEvent.findMany({
      where: {
        status: EventStatus.SCHEDULED,
        simulationTime: { lte: currentTime }
      },
      orderBy: [
        { simulationTime: 'asc' },
        { priority: 'desc' },
        { id: 'asc' }
      ],
      take: 10 // process batch size per tick
    });

    for (const event of events) {
      // Optimistic lock using updateMany and status condition
      const claimed = await this.prisma.simulationEvent.updateMany({
        where: { id: event.id, status: EventStatus.SCHEDULED },
        data: { status: EventStatus.PROCESSING }
      });

      if (claimed.count === 0) continue; // Concurrency: someone else claimed it

      try {
        await this.handleEvent(event);
        
        await this.prisma.simulationEvent.update({
          where: { id: event.id },
          data: { status: EventStatus.COMPLETED, processedAt: new Date() }
        });
        
        await this.prisma.simulationState.update({ 
          where: { id: stateId }, 
          data: { processedEvents: { increment: 1 } } 
        });
      } catch (error) {
        this.logger.error(`Failed to process event ${event.id}:`, error);
        const newRetryCount = event.retryCount + 1;
        const status = newRetryCount >= 3 ? EventStatus.FAILED : EventStatus.SCHEDULED;
        
        await this.prisma.simulationEvent.update({
          where: { id: event.id },
          data: { status, retryCount: newRetryCount }
        });
        
        if (status === EventStatus.FAILED) {
          await this.prisma.simulationState.update({
            where: { id: stateId },
            data: { failedEvents: { increment: 1 } }
          });
        }
      }
    }
  }

  private async handleEvent(event: any) {
    switch (event.type) {
      case 'EMPLOYEE_WORK_CYCLE': {
        const payload = event.payload as any;
        const agentId = payload.agentId;
        // Re-check at execution time: the event may have been queued before a shutdown.
        const agent = await this.prisma.agent.findUnique({ where: { id: agentId }, include: { employee: { select: { companyId: true } } } });
        const blocks = await this.workBlocks();
        if (!agent || blocks.global || blocks.companies.has(agent.employee.companyId) || blocks.employees.has(agent.employeeId)) {
          this.logger.log(`Skipping work cycle for agent ${agentId}: blocked by kill switch or parked venture`);
          break;
        }
        await this.workCycleService.runWorkCycle(agentId);
        break;
      }
      case 'WORLD_EVENT':
        await this.handleWorldEvent(event);
        break;
      case 'ECONOMIC_SHOCK':
        await this.handleEconomicShock(event);
        break;
      case 'MARKET_TICK':
        await this.handleMarketTick(event);
        break;
      case 'LEAD_FOUND':
        // Consumed by the sales agent loop (Step 3); acknowledged here so it is not flagged unknown.
        this.logger.log(`Lead found: ${(event.payload as any).leadId}`);
        break;
      default:
        this.logger.warn(`Unknown event type: ${event.type}`);
    }
  }

  private async handleWorldEvent(event: any) {
    const payload = event.payload as any;
    this.logger.log(`World event processed: ${payload.worldEventId} — ${payload.description}`);
    // Advisory only — no direct company mutation
  }

  private async handleEconomicShock(event: any) {
    const payload = event.payload as any;
    this.logger.log(
      `Economic shock: areas=${(payload.affectedAreas ?? []).join(',')} magnitude=${payload.magnitude}`,
    );
    // Log shock as a company event record if we have a companyId in payload
    // ponytail: no company data mutation in Phase 41, extend when cost model is wired
  }

  private async handleMarketTick(event: any) {
    const payload = event.payload as any;
    this.logger.log(`Market tick processed with snapshot keys: ${Object.keys(payload.marketStateSnapshot ?? {}).join(',')}`);
  }

  async dispatchCustomEvent(companyId: string, employeeId: string | null, payload: any) {
    const state = await this.prisma.simulationState.findFirst();
    if (!state) return;
    
    await this.prisma.simulationEvent.create({
      data: {
        simulationTime: state.simulationTime,
        priority: 5,
        type: payload.type || 'CUSTOM_EVENT',
        payload: {
          employeeId,
          ...payload
        }
      }
    });
  }
}
