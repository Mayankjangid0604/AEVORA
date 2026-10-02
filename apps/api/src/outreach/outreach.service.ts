import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { ExecutionEnvironment, OutreachDraftStatus } from '@prisma/client';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface CreateDraftDto {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  messageBody: string;
  reasonForContact?: string;
  researchEvidence?: any;
  proposedNextAction?: string;
  riskFlags?: any;
  opportunityId?: string;
  salesLeadId?: string;
}

@Injectable()
export class OutreachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationService: IntegrationService,
    private readonly logger: StructuredLoggerService
  ) {}

  async createDraft(companyId: string, actorId: string, dto: CreateDraftDto) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Invalid actor');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is inactive');

    const draft = await this.prisma.outreachDraft.create({
      data: {
        companyId,
        recipientEmail: dto.recipientEmail,
        recipientName: dto.recipientName,
        subject: dto.subject,
        messageBody: dto.messageBody,
        reasonForContact: dto.reasonForContact,
        researchEvidence: dto.researchEvidence ?? {},
        proposedNextAction: dto.proposedNextAction,
        riskFlags: dto.riskFlags ?? {},
        opportunityId: dto.opportunityId,
        salesLeadId: dto.salesLeadId,
        status: 'PENDING_APPROVAL', // Immediately requires approval
        idempotencyKey: `draft-${Date.now()}-${dto.recipientEmail}`
      },
    });

    this.logger.log(`Created OutreachDraft ${draft.id} for ${dto.recipientEmail}`, OutreachService.name);
    return draft;
  }

  async approveAndSend(companyId: string, approverId: string, draftId: string) {
    // 1. Verify approver (must be CHAIRMAN or have high auth - we check actor validity here)
    const approver = await this.prisma.employee.findUnique({ where: { id: approverId }, include: { role: true } });
    if (!approver || approver.companyId !== companyId) throw new ForbiddenException('Invalid approver');
    if (approver.status !== 'ACTIVE') throw new ForbiddenException('Approver is inactive');
    
    // For safety, only CHAIRMAN role can approve outreach in this minimal implementation
    if (approver.role.accessLevel !== 'CHAIRMAN' && approver.role.accessLevel !== 'MANAGEMENT') {
        throw new ForbiddenException('Only Management/Chairman can approve outreach');
    }

    const draft = await this.prisma.outreachDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.companyId !== companyId) throw new NotFoundException('Draft not found');
    if (draft.status !== 'PENDING_APPROVAL' && draft.status !== 'DRAFT') {
      throw new BadRequestException(`Draft is in invalid state: ${draft.status}`);
    }

    // 2. Mark as APPROVED
    await this.prisma.outreachDraft.update({
      where: { id: draftId },
      data: { status: 'APPROVED', approvedBy: approverId, approvedAt: new Date() }
    });

    // 3. Send email using IntegrationService
    // We determine environment based on some company config, assume PRODUCTION for this acquisition loop
    const environment = ExecutionEnvironment.PRODUCTION; 
    
    try {
      await this.prisma.outreachDraft.update({
        where: { id: draftId },
        data: { status: 'SENDING' }
      });

      const response = await this.integrationService.sendEmail(
        companyId, 
        environment, 
        {
          to: draft.recipientEmail,
          subject: draft.subject,
          body: draft.messageBody
        },
        approverId
      );

      // 4. Mark SENT
      await this.prisma.outreachDraft.update({
        where: { id: draftId },
        data: { status: 'SENT', sentAt: new Date() }
      });

      this.logger.log(`Successfully sent Draft ${draftId}`, OutreachService.name);
      return { success: true, response };

    } catch (error) {
      // 5. Mark FAILED
      await this.prisma.outreachDraft.update({
        where: { id: draftId },
        data: { status: 'FAILED', errorMessage: error.message }
      });
      this.logger.error(`Failed to send Draft ${draftId}: ${error.message}`, error.stack, OutreachService.name);
      throw error;
    }
  }

  async rejectDraft(companyId: string, approverId: string, draftId: string, reason: string) {
     const approver = await this.prisma.employee.findUnique({ where: { id: approverId }, include: { role: true } });
     if (!approver || approver.companyId !== companyId) throw new ForbiddenException('Invalid approver');
     if (approver.status !== 'ACTIVE') throw new ForbiddenException('Approver is inactive');

     const draft = await this.prisma.outreachDraft.findUnique({ where: { id: draftId } });
     if (!draft || draft.companyId !== companyId) throw new NotFoundException('Draft not found');

     await this.prisma.outreachDraft.update({
         where: { id: draftId },
         data: { status: 'FAILED', errorMessage: `Rejected by ${approverId}: ${reason}` }
     });

     return { success: true };
  }

  async getDrafts(companyId: string, status?: OutreachDraftStatus) {
      return this.prisma.outreachDraft.findMany({
          where: { companyId, ...(status ? { status } : {}) },
          orderBy: { createdAt: 'desc' }
      });
  }
}
