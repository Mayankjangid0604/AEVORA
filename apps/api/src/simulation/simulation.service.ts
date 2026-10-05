import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationStatus } from '@prisma/client';

@Injectable()
export class SimulationService {
  constructor(private prisma: PrismaService) {}

  async getSimulationState(companyId: string) {
    let state = await this.prisma.simulationState.findFirst({
      where: { companyId }
    });
    if (!state) {
      state = await this.prisma.simulationState.create({
        data: { 
          status: SimulationStatus.STOPPED, 
          speedMultiplier: 1.0, 
          currentTick: 0,
          companyId 
        }
      });
    }
    return state;
  }

  async start(companyId: string) {
    const state = await this.getSimulationState(companyId);
    if (state.status === SimulationStatus.RUNNING) throw new BadRequestException('Already running');
    
    return this.prisma.simulationState.update({
      where: { id: state.id },
      data: { status: SimulationStatus.RUNNING, realTimeStart: new Date() }
    });
  }

  async pause(companyId: string) {
    const state = await this.getSimulationState(companyId);
    if (state.status !== SimulationStatus.RUNNING) throw new BadRequestException('Not running');
    
    return this.prisma.simulationState.update({
      where: { id: state.id },
      data: { status: SimulationStatus.PAUSED }
    });
  }

  async resume(companyId: string) {
    const state = await this.getSimulationState(companyId);
    if (state.status !== SimulationStatus.PAUSED) throw new BadRequestException('Not paused');
    
    return this.prisma.simulationState.update({
      where: { id: state.id },
      data: { status: SimulationStatus.RUNNING }
    });
  }

  async stop(companyId: string) {
    const state = await this.getSimulationState(companyId);
    
    return this.prisma.simulationState.update({
      where: { id: state.id },
      data: { status: SimulationStatus.STOPPED }
    });
  }

  async getEvents() {
    return this.prisma.simulationEvent.findMany({
      orderBy: [
        { simulationTime: 'asc' },
        { priority: 'desc' }
      ],
      take: 100
    });
  }

  async getMetrics(companyId: string) {
    const state = await this.getSimulationState(companyId);
    const activeAgents = await this.prisma.agent.count({ where: { status: 'ACTIVE', employee: { companyId } }});
    const activeTasks = await this.prisma.task.count({ where: { status: { in: ['READY', 'IN_PROGRESS'] }, companyId }});
    
    return {
      simulationTime: state.simulationTime,
      realTime: new Date(),
      speed: state.speedMultiplier,
      eventsProcessed: state.processedEvents,
      eventsFailed: state.failedEvents,
      activeAgents,
      activeTasks
    };
  }
}
