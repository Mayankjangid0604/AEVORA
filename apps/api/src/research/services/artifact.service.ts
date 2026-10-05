import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelVersionStatus } from '@prisma/client';

@Injectable()
export class ArtifactService {
  constructor(private readonly prisma: PrismaService) {}

  async promoteArtifactToModelVersion(
    artifactId: string,
    modelId: string,
    version: string,
    createdBy: string
  ) {
    const artifact = await this.prisma.modelArtifact.findUnique({
      where: { id: artifactId },
      include: { trainingRun: true }
    });
    
    if (!artifact) throw new NotFoundException('Artifact not found');
    if (artifact.modelVersionId) throw new BadRequestException('Artifact already promoted');

    // Create the ModelVersion
    const modelVersion = await this.prisma.modelVersion.create({
      data: {
        modelId,
        version,
        artifactRef: artifact.storageRef,
        baseModelId: artifact.trainingRun?.baseModelVersionId,
        metadata: {
          artifactId: artifact.id,
          trainingRunId: artifact.trainingRunId,
          simulated: artifact.status === 'SIMULATED'
        },
        createdBy,
        status: ModelVersionStatus.EXPERIMENTAL
      }
    });

    // Update artifact
    await this.prisma.modelArtifact.update({
      where: { id: artifactId },
      data: { modelVersionId: modelVersion.id }
    });

    return modelVersion;
  }
}
