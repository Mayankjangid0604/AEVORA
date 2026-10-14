import { Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { OutreachDraftStatus } from '@prisma/client';
import { assertOutreachActor, isRecipientSuppressed, outreachEnv } from '../integration/integration.service';
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
    await this.assertActor(companyId, actorId, false);

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
    await this.assertActor(companyId, approverId, true);

    const draft = await this.prisma.outreachDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.companyId !== companyId) throw new NotFoundException('Draft not found');
    if (draft.status !== 'PENDING_APPROVAL' && draft.status !== 'DRAFT') {
      throw new BadRequestException(`Draft is in invalid state: ${draft.status}`);
    }

    // 2. Suppression: never contact an address that unsubscribed or whose lead was disqualified.
    if (await this.isSuppressed(companyId, draft.recipientEmail)) {
      await this.prisma.outreachDraft.update({
        where: { id: draftId },
        data: { status: 'FAILED', errorMessage: 'Recipient is suppressed (unsubscribed or disqualified)' },
      });
      throw new ForbiddenException('Recipient is suppressed');
    }

    // 3. Atomic claim: only one approver can move the draft to SENDING, so it is never sent twice.
    const claimed = await this.prisma.outreachDraft.updateMany({
      where: { id: draftId, companyId, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
      data: { status: 'SENDING', approvedBy: approverId, approvedAt: new Date() },
    });
    if (!claimed.count) throw new ConflictException('Draft already approved or being sent');

    // SANDBOX unless OUTREACH_ENVIRONMENT=PRODUCTION (and even then IntegrationService redirects unless real sending is enabled).
    const environment = outreachEnv();

    try {
      const response = await this.integrationService.sendEmail(
        companyId, 
        environment, 
        {
          to: draft.recipientEmail,
          subject: draft.subject,
          body: draft.messageBody
        },
        approverId,
        { draftId },
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
     await this.assertActor(companyId, approverId, true);

     const draft = await this.prisma.outreachDraft.findUnique({ where: { id: draftId } });
     if (!draft || draft.companyId !== companyId) throw new NotFoundException('Draft not found');
     if (draft.status !== 'PENDING_APPROVAL' && draft.status !== 'DRAFT') {
       throw new BadRequestException(`Draft is in invalid state: ${draft.status}`);
     }

     await this.prisma.outreachDraft.update({
         where: { id: draftId },
         data: { status: 'FAILED', errorMessage: `Rejected by ${approverId}: ${reason}` }
     });

     return { success: true };
  }

  private assertActor(companyId: string, actorId: string, approving: boolean) {
    return assertOutreachActor(this.prisma, companyId, actorId, approving);
  }

  isSuppressed(companyId: string, email: string): Promise<boolean> {
    return isRecipientSuppressed(this.prisma, companyId, email);
  }

  async getDrafts(companyId: string, status?: OutreachDraftStatus) {
      return this.prisma.outreachDraft.findMany({
          where: { companyId, ...(status ? { status } : {}) },
          orderBy: { createdAt: 'desc' }
      });
  }
}
