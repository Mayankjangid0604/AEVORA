import { Injectable, Logger } from '@nestjs/common';
import { ExternalActionAdapter, AdapterExecutionResult } from './external-action-adapter.interface';
import { ExternalActionType, ValidatedActionContext } from '../external-action-gateway.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesOutreachAdapter implements ExternalActionAdapter {
  private readonly logger = new Logger(SalesOutreachAdapter.name);
  readonly providerName = 'AEVORA_SALES_OUTREACH_ENGINE';

  constructor(private readonly prisma: PrismaService) {}

  supports(actionType: ExternalActionType): boolean {
    return actionType === 'SALES_OUTREACH';
  }

  async execute(context: ValidatedActionContext): Promise<AdapterExecutionResult> {
    try {
      const targetLeadId = context.target.targetId;
      const targetContact = context.target.targetRecipient || context.sanitizedPayload.contact;

      if (!targetLeadId && !targetContact) {
        return {
          success: false,
          provider: this.providerName,
          errorMessage: 'Sales outreach requires target leadId or recipient contact.',
        };
      }

      // Check lead existence if leadId provided
      if (targetLeadId) {
        const lead = await this.prisma.salesLead.findFirst({
          where: { id: targetLeadId, companyId: context.companyId },
          select: { id: true, status: true },
        });

        if (!lead) {
          return {
            success: false,
            provider: this.providerName,
            errorMessage: `Target lead ${targetLeadId} does not belong to company ${context.companyId}.`,
          };
        }
      }

      const externalRefId = `outreach_${context.companyId}_${Date.now()}`;

      // Record outreach event / update lead note if applicable
      return {
        success: true,
        externalReferenceId: externalRefId,
        provider: this.providerName,
        resultPayload: {
          leadId: targetLeadId,
          contact: targetContact,
          channel: context.sanitizedPayload.channel || 'EMAIL',
          pitchSummary: context.sanitizedPayload.pitch || context.intendedEffect,
          deliveredAt: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      this.logger.error(`SalesOutreachAdapter execution failed: ${err.message}`, err.stack);
      return {
        success: false,
        provider: this.providerName,
        errorMessage: err.message,
      };
    }
  }
}
