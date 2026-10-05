import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EconomyService } from '../../economy/economy.service';
import { ExperimentStatus } from '@prisma/client';

@Injectable()
export class ExperimentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economyService: EconomyService
  ) {}

  async createExperiment(data: {
    researchProjectId: string;
    name: string;
    hypothesis: string;
    configuration?: any;
    modelVersionId?: string;
    hyperparameters?: any;
    resourceAllocation?: any;
    randomSeed?: string;
    codeIdentifier?: string;
    parentExperimentId?: string;
    datasetVersionIds?: string[];
  }) {
    // Determine experiment number
    const count = await this.prisma.experiment.count({
      where: { researchProjectId: data.researchProjectId }
    });

    return this.prisma.experiment.create({
      data: {
        researchProjectId: data.researchProjectId,
        experimentNumber: count + 1,
        name: data.name,
        hypothesis: data.hypothesis,
        configuration: data.configuration || {},
        modelVersionId: data.modelVersionId,
        hyperparameters: data.hyperparameters || {},
        resourceAllocation: data.resourceAllocation || {},
        randomSeed: data.randomSeed,
        codeIdentifier: data.codeIdentifier,
        parentExperimentId: data.parentExperimentId,
        status: ExperimentStatus.PLANNED,
        datasetVersions: {
          connect: (data.datasetVersionIds || []).map(id => ({ id }))
        }
      },
    });
  }

  async executeExperiment(experimentId: string, simulatedCostAC: number = 0) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { project: true }
    });
    if (!experiment) throw new NotFoundException('Experiment not found');

    if (experiment.status !== ExperimentStatus.PLANNED && experiment.status !== ExperimentStatus.QUEUED) {
      throw new BadRequestException('Experiment is not in a runnable state');
    }

    // Attempt to fund from project budget
    if (simulatedCostAC > 0) {
      if (experiment.project.budget < simulatedCostAC) {
        await this.prisma.experiment.update({
          where: { id: experimentId },
          data: { status: ExperimentStatus.RESOURCE_LIMIT }
        });
        throw new BadRequestException('Insufficient project budget for experiment');
      }

      // Deduct budget
      await this.prisma.researchProject.update({
        where: { id: experiment.project.id },
        data: { budget: experiment.project.budget - simulatedCostAC }
      });
    }

    // Set to running
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status: ExperimentStatus.RUNNING, startedAt: new Date() }
    });

    // Simulate execution synchronously for MVP
    // In reality, this would dispatch to a worker
    const reproducibilityData = {
      executionTimeMs: 1200,
      computeUnitsUsed: simulatedCostAC,
      deterministicSeed: experiment.randomSeed || 'auto-generated-seed',
      environment: 'Aevora-Simulated-Cluster-01'
    };

    return this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: ExperimentStatus.COMPLETED,
        completedAt: new Date(),
        reproducibilityData
      }
    });
  }

  async cancelExperiment(experimentId: string) {
    return this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status: ExperimentStatus.CANCELLED }
    });
  }

  async updateExperiment(experimentId: string, data: any) {
    const experiment = await this.prisma.experiment.findUnique({ where: { id: experimentId } });
    if (!experiment) throw new NotFoundException('Experiment not found');
    
    // IMMUTABILITY CHECK
    if (experiment.status === ExperimentStatus.COMPLETED || experiment.status === ExperimentStatus.FAILED) {
      throw new BadRequestException('Cannot mutate a completed or failed experiment.');
    }

    return this.prisma.experiment.update({
      where: { id: experimentId },
      data
    });
  }
}
