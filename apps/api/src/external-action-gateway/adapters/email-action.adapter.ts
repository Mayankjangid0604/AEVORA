import { Injectable, Logger } from '@nestjs/common';
import { ExternalActionAdapter, AdapterExecutionResult } from './external-action-adapter.interface';
import { ExternalActionType, ValidatedActionContext } from '../external-action-gateway.types';
import { IntegrationService, EmailPayload } from '../../integration/integration.service';

@Injectable()
export class EmailActionAdapter implements ExternalActionAdapter {
  private readonly logger = new Logger(EmailActionAdapter.name);
  readonly providerName = 'AEVORA_EMAIL_SERVICE';

  constructor(private readonly integrationService: IntegrationService) {}

  supports(actionType: ExternalActionType): boolean {
    return actionType === 'SEND_EMAIL' || actionType === 'CUSTOMER_COMMUNICATION';
  }

  async execute(context: ValidatedActionContext): Promise<AdapterExecutionResult> {
    try {
      const recipient = context.target.targetRecipient || context.sanitizedPayload.to;
      if (!recipient) {
        return {
          success: false,
          provider: this.providerName,
          errorMessage: 'Missing email recipient address in target or payload.',
        };
      }

      const emailPayload: EmailPayload = {
        to: recipient,
        subject: context.sanitizedPayload.subject || `Notification: ${context.intendedEffect}`,
        body: context.sanitizedPayload.body || context.intendedEffect,
        senderName: context.sanitizedPayload.senderName || 'AEVORA Executive Suite',
        leadId: context.target.targetId,
        correlationId: context.actionId,
      };

      const result = await this.integrationService.sendEmail(
        context.companyId,
        context.environment,
        emailPayload,
        context.requestingActorId,
      );

      return {
        success: result.success,
        externalReferenceId: result.referenceId || `email_${Date.now()}`,
        provider: this.providerName,
        resultPayload: {
          originalRecipient: result.originalRecipient,
          actualRecipient: result.actualRecipient,
          redirected: result.redirected,
          message: result.message,
        },
        errorMessage: result.success ? undefined : (result.message || 'Email delivery failed'),
      };
    } catch (err: any) {
      this.logger.error(`EmailActionAdapter execution failed: ${err.message}`, err.stack);
      return {
        success: false,
        provider: this.providerName,
        errorMessage: err.message,
      };
    }
  }
}
