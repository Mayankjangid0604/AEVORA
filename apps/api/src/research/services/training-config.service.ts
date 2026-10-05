import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrainingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async createConfig(data: {
    companyId: string;
    researchProjectId: string;
    name: string;
    description: string;
    baseModel?: string;
    baseModelVersionId?: string;
    datasetVersions?: string[];
    method?: any; // TrainingMethod
    configuration?: any;
    hyperparameters?: any;
    resourceLimits?: any;
    maxRuntimeMs?: number;
    maxComputeUnits?: number;
    creatorId: string;
  }) {
    const project = await this.prisma.researchProject.findUnique({ where: { id: data.researchProjectId }});
    if (!project) throw new NotFoundException('Project not found');
    if (project.companyId !== data.companyId) {
      throw new Error('Company isolation violation: Project belongs to another company');
    }

    return this.prisma.trainingConfiguration.create({
      data: {
        companyId: data.companyId,
        researchProjectId: data.researchProjectId,
        name: data.name,
        description: data.description,
        baseModel: data.baseModel,
        baseModelVersionId: data.baseModelVersionId,
        datasetVersions: data.datasetVersions || [],
        method: data.method || 'SIMULATED_TRAINING',
        configuration: data.configuration || {},
        hyperparameters: data.hyperparameters || {},
        resourceLimits: data.resourceLimits || {},
        maxRuntimeMs: data.maxRuntimeMs,
        maxComputeUnits: data.maxComputeUnits,
        creatorId: data.creatorId
      }
    });
  }

  async getConfig(id: string) {
    const config = await this.prisma.trainingConfiguration.findUnique({
      where: { id },
      include: { runs: true }
    });
    if (!config) throw new NotFoundException('Training configuration not found');
    return config;
  }
}
