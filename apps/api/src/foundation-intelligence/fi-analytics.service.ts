import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiDatasetStatus, FiTrainingJobStatus, FiModelStatus } from '@prisma/client';

@Injectable()
export class FiAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(companyId: string) {
    const [totalDatasets, validatedDatasets, totalJobs, completedJobs, totalModels, productionModels] = await Promise.all([
      this.prisma.fiDataset.count({ where: { companyId } }),
      this.prisma.fiDataset.count({ where: { companyId, status: FiDatasetStatus.VALIDATED } }),
      this.prisma.fiTrainingJob.count({ where: { companyId } }),
      this.prisma.fiTrainingJob.count({ where: { companyId, status: FiTrainingJobStatus.COMPLETED } }),
      this.prisma.fiModelVersion.count({ where: { companyId } }),
      this.prisma.fiModelVersion.count({ where: { companyId, status: FiModelStatus.PRODUCTION } }),
    ]);
    return {
      isAdvisory: true,
      totalDatasets, validatedDatasets,
      totalJobs, completedJobs,
      totalModels, productionModels,
    };
  }
}
