import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  HandoverPackage,
  HandoverStatus,
  QualityGateEvaluation,
  DeploymentRecord,
} from './project-delivery.types';

@Injectable()
export class FactoryDeliveryHandoverService {
  private readonly logger = new Logger(FactoryDeliveryHandoverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Packages project deliverables, quality evidence, deployment links,
   * documentation, and known limitations into a formal delivery package.
   */
  async prepareDeliveryPackage(params: {
    projectId: string;
    requestedById: string;
    workspacePath: string;
    artifactPath: string;
    qualityGate: QualityGateEvaluation;
    deployment?: DeploymentRecord;
    documentation?: string;
    knownLimitations?: string[];
  }): Promise<HandoverPackage> {
    const {
      projectId,
      requestedById,
      workspacePath,
      artifactPath,
      qualityGate,
      deployment,
      documentation,
      knownLimitations = [],
    } = params;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { requirements: true, client: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    if (qualityGate.overallStatus !== 'PASSED') {
      throw new BadRequestException('Cannot prepare delivery: Quality gate must be PASSED before packaging.');
    }

    const docInstructions = documentation || `Operational Runbook for ${project.name}:
1. Source files located at local project workspace: ${workspacePath}
2. Distribution artifact bundle verified: ${artifactPath}
3. Deployment URL: ${deployment?.deploymentUrl || 'Local Preview Only'}
4. To run locally: npm install && npm run build && npm run test`;

    const summary = `Delivery Package for ${project.name} (v1.0.0). Contains ${project.requirements.length} satisfied requirements. Quality score: ${qualityGate.score}/100.`;

    // 1. Create or Update ProjectDelivery
    const delivery = await this.prisma.projectDelivery.create({
      data: {
        projectId,
        buildId: qualityGate.buildId,
        version: 1,
        summary,
        deliverables: JSON.stringify({
          sourceLocation: workspacePath,
          artifactPath,
          deploymentUrl: deployment?.deploymentUrl,
          evidenceHash: qualityGate.evidenceHash,
          requirementsCount: project.requirements.length,
        }),
        status: 'READY_FOR_ACCEPTANCE',
      },
    });

    // 2. Create pending CustomerAcceptance
    await this.prisma.customerAcceptance.create({
      data: {
        companyId: project.companyId,
        clientId: project.clientId,
        projectId: project.id,
        deliveryId: delivery.id,
        requestedById,
        scope: summary,
        status: 'PENDING',
      },
    });

    // 3. Mark Project DELIVERED
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'DELIVERED' },
    });

    const handoverPackage: HandoverPackage = {
      id: delivery.id,
      projectId,
      clientId: project.clientId,
      status: HandoverStatus.PREPARED,
      packageSummary: summary,
      sourceLocation: workspacePath,
      artifactPath,
      deploymentUrl: deployment?.deploymentUrl,
      testEvidenceSummary: `Passed all quality checks. Hash: ${qualityGate.evidenceHash}`,
      documentationInstructions: docInstructions,
      knownLimitations,
      preparedAt: new Date(),
    };

    this.logger.log(`Prepared delivery package for project ${projectId} (delivery: ${delivery.id})`);
    return handoverPackage;
  }

  /**
   * Client accepts the formal delivery and executes authorized ownership handover.
   */
  async clientAcceptHandover(deliveryId: string, clientActorId: string) {
    const delivery = await this.prisma.projectDelivery.findUnique({
      where: { id: deliveryId },
      include: { project: true },
    });
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`);

    if (delivery.status !== 'READY_FOR_ACCEPTANCE') {
      throw new BadRequestException(`Delivery is not in READY_FOR_ACCEPTANCE status (current: ${delivery.status})`);
    }

    const acceptance = await this.prisma.customerAcceptance.findFirst({
      where: { deliveryId, status: 'PENDING' },
    });
    if (!acceptance) throw new NotFoundException('Pending customer acceptance record not found');

    const now = new Date();

    // 1. Update CustomerAcceptance
    await this.prisma.customerAcceptance.update({
      where: { id: acceptance.id },
      data: {
        status: 'ACCEPTED',
        customerActorId: clientActorId,
        acceptedAt: now,
      },
    });

    // 2. Update ProjectDelivery
    await this.prisma.projectDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'ACCEPTED',
        approvedAt: now,
        deliveredAt: now,
      },
    });

    // 3. Mark Project COMPLETED
    await this.prisma.project.update({
      where: { id: delivery.projectId },
      data: {
        status: 'COMPLETED',
      },
    });

    // 4. Emit Audit Event
    await this.prisma.companyEvent.create({
      data: {
        companyId: delivery.project.companyId,
        type: 'PROJECT_OWNERSHIP_TRANSFERRED',
        payload: {
          projectId: delivery.projectId,
          deliveryId,
          acceptedBy: clientActorId,
          transferredAt: now,
        },
      },
    });

    this.logger.log(`Project ${delivery.projectId} ownership successfully transferred and accepted by client ${clientActorId}`);

    return {
      status: HandoverStatus.TRANSFERRED,
      acceptedAt: now,
      deliveryId,
      projectId: delivery.projectId,
    };
  }

  /**
   * Client requests revisions on a prepared delivery package.
   */
  async clientRequestRevision(deliveryId: string, clientActorId: string, revisionNotes: string) {
    const delivery = await this.prisma.projectDelivery.findUnique({
      where: { id: deliveryId },
      include: { project: true },
    });
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`);

    const acceptance = await this.prisma.customerAcceptance.findFirst({
      where: { deliveryId, status: 'PENDING' },
    });
    if (!acceptance) throw new NotFoundException('Pending customer acceptance record not found');

    // Update CustomerAcceptance
    await this.prisma.customerAcceptance.update({
      where: { id: acceptance.id },
      data: {
        status: 'CHANGES_REQUESTED',
        customerActorId: clientActorId,
        changesRequested: revisionNotes,
      },
    });

    // Update Delivery to REJECTED
    await this.prisma.projectDelivery.update({
      where: { id: deliveryId },
      data: { status: 'REJECTED' },
    });

    // Project moves back to ACTIVE
    await this.prisma.project.update({
      where: { id: delivery.projectId },
      data: { status: 'ACTIVE' },
    });

    return {
      status: HandoverStatus.REJECTED,
      changesRequested: revisionNotes,
    };
  }
}
