import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DatasetStatus } from '@prisma/client';

@Injectable()
export class DatasetService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDataset(data: {
    name: string;
    description: string;
    type: string;
    owner: string;
    provenance: string;
    licenseMetadata?: any;
    source: string;
    sensitivity?: string;
    createdBy: string;
  }) {
    return this.prisma.dataset.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        owner: data.owner,
        provenance: data.provenance,
        licenseMetadata: data.licenseMetadata || {},
        source: data.source,
        sensitivity: data.sensitivity || 'PUBLIC',
        createdBy: data.createdBy,
        status: DatasetStatus.DRAFT,
      },
    });
  }

  async createDatasetVersion(datasetId: string, data: {
    version: string;
    contentHash: string;
    sizeBytes: number;
    creationProcess: string;
    sourceVersions?: any[];
    transformations?: any[];
  }) {
    const dataset = await this.prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) throw new NotFoundException('Dataset not found');

    // Compile lineage
    const lineage = [
      { step: 'source', details: dataset.provenance },
      { step: 'creation', details: data.creationProcess, transformations: data.transformations || [] }
    ];

    const dsVersion = await this.prisma.datasetVersion.create({
      data: {
        datasetId,
        version: data.version,
        contentHash: data.contentHash,
        sizeBytes: data.sizeBytes,
        creationProcess: data.creationProcess,
        sourceVersions: data.sourceVersions || [],
        transformations: data.transformations || [],
        lineage,
        validationState: 'VALIDATED'
      }
    });
    
    // Mark parent dataset as ready if it was draft
    if (dataset.status === DatasetStatus.DRAFT) {
      await this.prisma.dataset.update({
        where: { id: datasetId },
        data: { status: DatasetStatus.READY }
      });
    }

    return dsVersion;
  }

  async getDatasetLineage(datasetVersionId: string) {
    const version = await this.prisma.datasetVersion.findUnique({
      where: { id: datasetVersionId },
      include: { dataset: true }
    });
    if (!version) throw new NotFoundException('Dataset version not found');
    return {
      dataset: version.dataset.name,
      provenance: version.dataset.provenance,
      version: version.version,
      lineage: version.lineage,
    };
  }
}
