import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus, ProjectDeliveryStatus, CustomerAcceptanceStatus } from '@prisma/client';

@Injectable()
export class FormalDeliveryService {
  private readonly logger = new Logger(FormalDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Package a successful build into a formal ProjectDelivery
   */
  async packageDelivery(projectId: string, requestedById: string, summary: string, deliverables: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    
    // Only package if it's currently ACTIVE or IN_QA or BLOCKED (maybe needs delivery to clear block)
    if (!['ACTIVE', 'IN_QA', 'PLANNED'].includes(project.status)) {
      throw new BadRequestException(`Cannot package delivery for project in status ${project.status}`);
    }

    // Ensure tests passed (or at least build succeeded)
    const lastTest = await this.prisma.projectTestExecution.findFirst({
      where: { projectId, status: 'PASSED' },
      orderBy: { completedAt: 'desc' }
    });

    if (!lastTest) {
      throw new BadRequestException('Cannot package delivery without a passing test execution');
    }

    const delivery = await this.prisma.projectDelivery.create({
      data: {
        projectId,
        buildId: lastTest.buildId,
        summary,
        deliverables,
        status: ProjectDeliveryStatus.READY_FOR_ACCEPTANCE,
        version: 1, // could increment based on previous deliveries
      }
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.DELIVERED }
    });

    // Create the pending customer acceptance
    await this.prisma.customerAcceptance.create({
      data: {
        companyId: project.companyId,
        clientId: project.clientId,
        projectId: project.id,
        deliveryId: delivery.id,
        requestedById,
        scope: summary,
        status: CustomerAcceptanceStatus.PENDING
      }
    });

    return delivery;
  }

  /**
   * Client formal review and accept
   */
  async acceptDelivery(deliveryId: string, actorId: string) {
    const delivery = await this.prisma.projectDelivery.findUnique({
      where: { id: deliveryId },
      include: { project: true }
    });

    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== ProjectDeliveryStatus.READY_FOR_ACCEPTANCE) {
      throw new BadRequestException('Delivery is not pending acceptance');
    }

    const acceptance = await this.prisma.customerAcceptance.findFirst({
      where: { deliveryId, status: CustomerAcceptanceStatus.PENDING }
    });

    if (!acceptance) {
      throw new BadRequestException('No pending customer acceptance found');
    }

    await this.prisma.customerAcceptance.update({
      where: { id: acceptance.id },
      data: {
        status: CustomerAcceptanceStatus.ACCEPTED,
        acceptedAt: new Date(),
        customerActorId: actorId
      }
    });

    await this.prisma.projectDelivery.update({
      where: { id: deliveryId },
      data: {
        status: ProjectDeliveryStatus.ACCEPTED,
        approvedAt: new Date(),
        deliveredAt: new Date()
      }
    });

    await this.prisma.project.update({
      where: { id: delivery.projectId },
      data: { status: ProjectStatus.ACCEPTED }
    });

    return delivery;
  }

  /**
   * Client requests revisions on a formal delivery
   */
  async requestRevision(deliveryId: string, actorId: string, changesRequested: string) {
    const delivery = await this.prisma.projectDelivery.findUnique({
      where: { id: deliveryId },
      include: { project: true }
    });

    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== ProjectDeliveryStatus.READY_FOR_ACCEPTANCE) {
      throw new BadRequestException('Delivery is not pending acceptance');
    }

    const acceptance = await this.prisma.customerAcceptance.findFirst({
      where: { deliveryId, status: CustomerAcceptanceStatus.PENDING }
    });

    if (!acceptance) {
      throw new BadRequestException('No pending customer acceptance found');
    }

    await this.prisma.customerAcceptance.update({
      where: { id: acceptance.id },
      data: {
        status: CustomerAcceptanceStatus.CHANGES_REQUESTED,
        changesRequested,
        customerActorId: actorId
      }
    });

    await this.prisma.projectDelivery.update({
      where: { id: deliveryId },
      data: {
        status: ProjectDeliveryStatus.REJECTED
      }
    });

    // Send back to ACTIVE / IN_REVIEW
    await this.prisma.project.update({
      where: { id: delivery.projectId },
      data: { status: ProjectStatus.ACTIVE }
    });

    return delivery;
  }
}
