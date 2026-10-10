import { Injectable, Logger } from '@nestjs/common';
import { ExternalActionAdapter, AdapterExecutionResult } from './external-action-adapter.interface';
import { ExternalActionType, ValidatedActionContext, ExternalActionStatusCheck } from '../external-action-gateway.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FinancialActionAdapter implements ExternalActionAdapter {
  private readonly logger = new Logger(FinancialActionAdapter.name);
  readonly providerName = 'AEVORA_TREASURY_GATEWAY';

  constructor(private readonly prisma: PrismaService) {}

  supports(actionType: ExternalActionType): boolean {
    return (
      actionType === 'AUTHORIZE_PAYMENT' ||
      actionType === 'TRANSFER_FUNDS' ||
      actionType === 'EXECUTE_REFUND'
    );
  }

  async execute(context: ValidatedActionContext): Promise<AdapterExecutionResult> {
    try {
      const { actionType, companyId, financialExposure, sanitizedPayload } = context;

      if (financialExposure <= 0) {
        return {
          success: false,
          provider: this.providerName,
          errorMessage: 'Financial actions must have a strictly positive financial exposure.',
        };
      }

      // Check for forced simulation of uncertain provider state
      if (sanitizedPayload?.simulateUncertainState === true) {
        this.logger.warn(`Simulating uncertain provider state for action ${context.actionId}`);
        return {
          success: false,
          statusUnknown: true,
          externalReferenceId: `tx_uncertain_${Date.now()}`,
          provider: this.providerName,
          errorMessage: 'Provider timed out waiting for settlement response. State UNKNOWN.',
        };
      }

      // Check destination target
      const recipient = context.target.targetRecipient || sanitizedPayload.destinationAccount;
      if (!recipient) {
        return {
          success: false,
          provider: this.providerName,
          errorMessage: 'Financial action requires explicit destination recipient or account.',
        };
      }

      const txRef = `fin_tx_${companyId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      return {
        success: true,
        externalReferenceId: txRef,
        provider: this.providerName,
        resultPayload: {
          action: actionType,
          amount: financialExposure,
          currency: sanitizedPayload.currency || 'INR',
          destination: recipient,
          settledAt: new Date().toISOString(),
          reference: txRef,
        },
      };
    } catch (err: any) {
      this.logger.error(`FinancialActionAdapter failed: ${err.message}`, err.stack);
      return {
        success: false,
        provider: this.providerName,
        errorMessage: err.message,
      };
    }
  }

  async checkStatus(externalReferenceId: string): Promise<ExternalActionStatusCheck> {
    // Deterministic status check for reconciliation
    if (externalReferenceId.startsWith('tx_uncertain')) {
      return {
        externalReferenceId,
        status: 'UNKNOWN',
        verifiedAt: new Date(),
      };
    }

    return {
      externalReferenceId,
      status: 'SUCCESS',
      verifiedAt: new Date(),
    };
  }
}
