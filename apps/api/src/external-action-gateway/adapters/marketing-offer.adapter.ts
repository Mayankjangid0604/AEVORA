import { Injectable, Logger } from '@nestjs/common';
import { ExternalActionAdapter, AdapterExecutionResult } from './external-action-adapter.interface';
import { ExternalActionType, ValidatedActionContext } from '../external-action-gateway.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketingOfferAdapter implements ExternalActionAdapter {
  private readonly logger = new Logger(MarketingOfferAdapter.name);
  readonly providerName = 'AEVORA_V24_OFFER_MARKET_ADAPTER';

  constructor(private readonly prisma: PrismaService) {}

  supports(actionType: ExternalActionType): boolean {
    return (
      actionType === 'DISPATCH_OFFER' ||
      actionType === 'APPLY_DISCOUNT' ||
      actionType === 'MARKETING_CAMPAIGN'
    );
  }

  async execute(context: ValidatedActionContext): Promise<AdapterExecutionResult> {
    try {
      const { actionType, companyId, sanitizedPayload, financialExposure } = context;

      if (actionType === 'APPLY_DISCOUNT') {
        const discountPercent = sanitizedPayload.discountPercent ?? 0;
        if (discountPercent > 50 && !context.approvalId) {
          return {
            success: false,
            provider: this.providerName,
            errorMessage: 'Discounts exceeding 50% require explicit Chairman approval.',
          };
        }

        const externalRefId = `disc_${companyId}_${Date.now()}`;
        return {
          success: true,
          externalReferenceId: externalRefId,
          provider: this.providerName,
          resultPayload: {
            action: 'APPLY_DISCOUNT',
            discountPercent,
            dealId: context.target.targetId,
            appliedAt: new Date().toISOString(),
          },
        };
      }

      if (actionType === 'DISPATCH_OFFER') {
        const offerTitle = sanitizedPayload.offerTitle || context.intendedEffect;
        const targetRecipient = context.target.targetRecipient || sanitizedPayload.recipient;

        const externalRefId = `v24_offer_${companyId}_${Date.now()}`;
        return {
          success: true,
          externalReferenceId: externalRefId,
          provider: this.providerName,
          resultPayload: {
            action: 'DISPATCH_OFFER',
            offerTitle,
            targetRecipient,
            value: financialExposure,
            marketChannel: sanitizedPayload.channel || 'DIRECT_OMNICHANNEL',
            dispatchedAt: new Date().toISOString(),
          },
        };
      }

      if (actionType === 'MARKETING_CAMPAIGN') {
        const campaignName = sanitizedPayload.campaignName || context.intendedEffect;
        const externalRefId = `camp_${companyId}_${Date.now()}`;

        return {
          success: true,
          externalReferenceId: externalRefId,
          provider: this.providerName,
          resultPayload: {
            action: 'MARKETING_CAMPAIGN',
            campaignName,
            allocatedBudget: financialExposure,
            channels: sanitizedPayload.channels || ['EMAIL', 'WEB'],
            launchedAt: new Date().toISOString(),
          },
        };
      }

      return {
        success: false,
        provider: this.providerName,
        errorMessage: `Unsupported action type: ${actionType}`,
      };
    } catch (err: any) {
      this.logger.error(`MarketingOfferAdapter failed: ${err.message}`, err.stack);
      return {
        success: false,
        provider: this.providerName,
        errorMessage: err.message,
      };
    }
  }
}
