import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, IntegrationStatus } from '@prisma/client';
import { SandboxEmailProvider } from './providers/sandbox-email.provider';
import { ProductionEmailProvider } from './providers/production-email.provider';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  senderName?: string;
  businessName?: string;
  leadId?: string;
  source?: string;
  analysisResult?: any;
  outreachDecision?: any;
  rateLimitStatus?: any;
  correlationId?: string;
}

export interface IntegrationResponse {
  success: boolean;
  message?: string;
  referenceId?: string;
  originalRecipient?: string;
  actualRecipient?: string;
  redirected?: boolean;
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxEmail: SandboxEmailProvider,
    private readonly productionEmail: ProductionEmailProvider,
    private readonly logger: StructuredLoggerService
  ) {}

  async sendEmail(
    companyId: string,
    environment: ExecutionEnvironment,
    payload: EmailPayload,
    actorId?: string,
  ): Promise<IntegrationResponse> {
    const originalRecipient = payload.to;
    let actualRecipient = payload.to;
    let redirected = false;

    // Test mode redirection check for PRODUCTION
    if (environment === ExecutionEnvironment.PRODUCTION) {
      const isProdEnabled = process.env.ENABLE_REAL_PRODUCTION_SENDING === 'true';
      if (!isProdEnabled) {
        const testRecipient = process.env.TEST_EMAIL_RECIPIENT?.trim();
        if (!testRecipient) {
          throw new Error('TEST_EMAIL_RECIPIENT is missing or empty. The system is in test mode and fails closed to prevent sending real emails.');
        }
        actualRecipient = testRecipient;
        redirected = (originalRecipient !== testRecipient);
        if (redirected) {
          this.logger.log(`[TEST MODE] Redirecting email from ${originalRecipient} to ${testRecipient}`);
        }
      }
    }

    // Sanitize payload for audit log — zero credentials, tokens, or passwords
    const requestAuditPayload = {
      originalIntendedRecipient: originalRecipient,
      actualDeliveredRecipient: actualRecipient,
      redirected,
      subject: payload.subject,
      senderName: payload.senderName ?? 'Team',
      selectedBusiness: payload.businessName ?? null,
      leadId: payload.leadId ?? null,
      providerSource: payload.source ?? 'outreach',
      analysisResult: payload.analysisResult ?? null,
      outreachDecision: payload.outreachDecision ?? null,
      rateLimitStatus: payload.rateLimitStatus ?? null,
      correlationId: payload.correlationId ?? null,
    };

    // 1. Log attempt with structured audit
    const auditLog = await this.prisma.integrationAuditLog.create({
      data: {
        companyId,
        action: 'SEND_EMAIL',
        environment,
        status: 'PENDING',
        requestPayload: requestAuditPayload,
        actorId,
        idempotencyKey: payload.correlationId ?? null,
      },
    });

    try {
      // Find configured provider for email
      const provider = await this.prisma.providerIntegration.findFirst({
        where: {
          companyId,
          capabilityType: 'EMAIL',
          environment,
          status: IntegrationStatus.ACTIVE,
        },
      });

      let response: IntegrationResponse;

      if (environment === ExecutionEnvironment.SIMULATION || environment === ExecutionEnvironment.SANDBOX) {
        this.logger.log(
          `[${environment}] Delegating email to SandboxEmailProvider`,
          IntegrationService.name,
          { companyId, environment, auditLogId: auditLog.id, action: 'SEND_EMAIL' }
        );
        const result = await this.sandboxEmail.send({ ...payload, to: actualRecipient });
        response = {
          success: result.success,
          message: result.message,
          referenceId: result.referenceId,
          originalRecipient,
          actualRecipient,
          redirected,
        };
      } else {
        if (!provider && !process.env.SMTP_HOST) {
          throw new Error('NOT_IMPLEMENTED: No active email provider configured for PRODUCTION');
        }

        // Direct attempts to specify another recipient cannot bypass test-mode protection.
        // Send using the verified actual recipient.
        const sendPayload = { ...payload, to: actualRecipient };
        const result = await this.productionEmail.send(sendPayload);
        response = {
          success: result.success,
          message: result.message,
          referenceId: result.referenceId,
          originalRecipient,
          actualRecipient,
          redirected,
        };
      }

      const responseAuditPayload = {
        success: response.success,
        message: response.message,
        referenceId: response.referenceId,
        originalIntendedRecipient: originalRecipient,
        actualDeliveredRecipient: actualRecipient,
        redirected,
        deliveryStatus: 'SUCCESS',
        providerStatus: 'DELIVERED',
        environment,
        timestamp: new Date().toISOString(),
        correlationId: payload.correlationId ?? null,
      };

      await this.prisma.integrationAuditLog.update({
        where: { id: auditLog.id },
        data: {
          status: 'SUCCESS',
          responsePayload: responseAuditPayload,
          integrationId: provider?.id,
        },
      });

      return response;
    } catch (error) {
      const errorAuditPayload = {
        originalIntendedRecipient: originalRecipient,
        actualDeliveredRecipient: actualRecipient,
        redirected,
        deliveryStatus: 'FAILED',
        error: error.message,
        environment,
        timestamp: new Date().toISOString(),
        correlationId: payload.correlationId ?? null,
      };

      await this.prisma.integrationAuditLog.update({
        where: { id: auditLog.id },
        data: {
          status: 'FAILED',
          error: error.message,
          responsePayload: errorAuditPayload,
        },
      });
      throw error;
    }
  }
}
