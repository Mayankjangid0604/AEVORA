import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, IntegrationStatus, Prisma } from '@prisma/client';
import { assertOutboundAllowed, assertWithinSendLimits, normalizeEmail, unsubscribeUrl } from '../common/outbound-policy';
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
  /** Set by the gate only (List-Unsubscribe etc.); callers' values are overwritten. */
  headers?: Record<string, string>;
}

export interface IntegrationResponse {
  success: boolean;
  message?: string;
  referenceId?: string;
  originalRecipient?: string;
  actualRecipient?: string;
  redirected?: boolean;
  /** Nothing was sent: the message is stored as a PENDING_APPROVAL OutreachDraft (draftId) for a human to approve. */
  pendingApproval?: boolean;
  draftId?: string;
}

/** Server-side outreach environment (OUTREACH_ENVIRONMENT, default SANDBOX). Callers can lower it, never raise it. */
export function outreachEnv(): ExecutionEnvironment {
  return ExecutionEnvironment[process.env.OUTREACH_ENVIRONMENT as ExecutionEnvironment] ?? ExecutionEnvironment.SANDBOX;
}

export function effectiveEnvironment(requested: ExecutionEnvironment): ExecutionEnvironment {
  if (requested === ExecutionEnvironment.PRODUCTION && outreachEnv() === ExecutionEnvironment.PRODUCTION) return ExecutionEnvironment.PRODUCTION;
  return requested === ExecutionEnvironment.SIMULATION ? ExecutionEnvironment.SIMULATION : ExecutionEnvironment.SANDBOX;
}

/** Suppressed = on the EmailSuppression list, an UNSUBSCRIBED response to any draft for this address, or a DISQUALIFIED lead with it. */
export async function isRecipientSuppressed(prisma: PrismaService, companyId: string, email: string): Promise<boolean> {
  const address = { equals: email.trim(), mode: 'insensitive' as const };
  const drafts = await prisma.outreachDraft.findMany({ where: { companyId, recipientEmail: address }, select: { id: true } });
  const [listed, unsub, lead] = await Promise.all([
    prisma.emailSuppression.findUnique({ where: { companyId_email: { companyId, email: normalizeEmail(email) } } }),
    drafts.length
      ? prisma.outreachResponse.findFirst({ where: { companyId, responseType: 'UNSUBSCRIBED', draftId: { in: drafts.map((d) => d.id) } } })
      : null,
    prisma.salesLead.findFirst({ where: { companyId, status: 'DISQUALIFIED', contactEmail: address } }),
  ]);
  return !!(listed || unsub || lead);
}

/**
 * Actor = the company's Chairman (JWT actorId is the Chairman id) or an ACTIVE employee of the company.
 * Approving additionally needs the Chairman, or an employee with CHAIRMAN/MANAGEMENT access.
 */
export async function assertOutreachActor(prisma: PrismaService, companyId: string, actorId: string | undefined, approving: boolean) {
  if (!actorId) throw new ForbiddenException('Invalid actor');
  const owner = await prisma.company.findFirst({ where: { id: companyId, chairmanId: actorId }, select: { id: true } });
  if (owner) return;
  const emp = await prisma.employee.findUnique({ where: { id: actorId }, include: { role: true } });
  if (!emp || emp.companyId !== companyId) throw new ForbiddenException('Invalid actor');
  if (emp.status !== 'ACTIVE') throw new ForbiddenException('Actor is inactive');
  if (approving && emp.role?.accessLevel !== 'CHAIRMAN' && emp.role?.accessLevel !== 'MANAGEMENT') {
    throw new ForbiddenException('Only Management/Chairman can approve outreach');
  }
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxEmail: SandboxEmailProvider,
    private readonly productionEmail: ProductionEmailProvider,
    private readonly logger: StructuredLoggerService
  ) {}

  /**
   * THE outbound email gate. Every email to an outside recipient goes through here:
   *   kill switch (fail closed) -> suppression -> approval (an OutreachDraft in SENDING, approved, same tenant,
   *   same recipient and content) -> server-clamped environment -> test-recipient redirect -> provider.
   * Without `approval` nothing is sent: the message becomes a PENDING_APPROVAL draft (deduplicated) and
   * `{ success: false, pendingApproval: true, draftId }` is returned.
   */
  async sendEmail(
    companyId: string,
    requestedEnvironment: ExecutionEnvironment,
    payload: EmailPayload,
    actorId?: string,
    approval?: { draftId: string },
  ): Promise<IntegrationResponse> {
    if (!companyId) throw new ForbiddenException('Outbound email requires a tenant');
    await assertOutboundAllowed(this.prisma, companyId, 'EMAIL'); // emergency stop + kill switches, fails closed
    if (await isRecipientSuppressed(this.prisma, companyId, payload.to)) throw new ForbiddenException('Recipient is suppressed');

    if (!approval) return this.queueForApproval(companyId, payload);
    const draft = await this.prisma.outreachDraft.findFirst({ where: { id: approval.draftId, companyId } });
    if (
      !draft || draft.status !== 'SENDING' || !draft.approvedBy || !draft.approvedAt ||
      draft.recipientEmail.trim().toLowerCase() !== payload.to.trim().toLowerCase() ||
      draft.subject !== payload.subject || draft.messageBody !== payload.body
    ) {
      throw new ForbiddenException('Send not approved: no matching approved draft in SENDING state');
    }
    await assertWithinSendLimits(this.prisma, companyId, payload.to, draft.id);

    // Every outbound email carries a signed unsubscribe link (for the intended recipient, even when redirected in test
    // mode) plus RFC 8058 one-click headers. Added after the approval check, so the approved text stays comparable.
    const unsubscribe = unsubscribeUrl(companyId, payload.to);
    const outbound: EmailPayload = {
      ...payload,
      body: `${payload.body}\n\n--\nDon't want to hear from us again? Unsubscribe: ${unsubscribe}`,
      headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };

    const environment = effectiveEnvironment(requestedEnvironment);
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
        const result = await this.sandboxEmail.send({ ...outbound, to: actualRecipient });
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
        const sendPayload = { ...outbound, to: actualRecipient };
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

  /** Stores an unapproved send as a PENDING_APPROVAL draft. Same content to the same address = same draft (retries are no-ops). */
  private async queueForApproval(companyId: string, payload: EmailPayload): Promise<IntegrationResponse> {
    // One draft per originating unit of work (campaign/action id) — retries may regenerate the AI text; otherwise per content.
    const identity = payload.correlationId ? `corr|${payload.correlationId}` : `${payload.to.trim().toLowerCase()}|${payload.subject}|${payload.body}`;
    const digest = createHash('sha256').update(`${companyId}|${identity}`).digest('hex').slice(0, 32);
    const idempotencyKey = `auto:${digest}`;
    let draft = await this.prisma.outreachDraft.findUnique({ where: { idempotencyKey } });
    if (!draft) {
      try {
        draft = await this.prisma.outreachDraft.create({
          data: {
            companyId,
            recipientEmail: payload.to.trim(),
            recipientName: payload.businessName,
            subject: payload.subject,
            messageBody: payload.body,
            reasonForContact: payload.source ?? 'automated',
            researchEvidence: { source: payload.source ?? null, correlationId: payload.correlationId ?? null, analysis: payload.analysisResult ?? null },
            salesLeadId: payload.leadId,
            status: 'PENDING_APPROVAL',
            idempotencyKey,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        draft = await this.prisma.outreachDraft.findUniqueOrThrow({ where: { idempotencyKey } });
      }
    }
    this.logger.log(`Outbound email to ${payload.to} queued for approval as draft ${draft.id}`, IntegrationService.name);
    return { success: false, pendingApproval: true, draftId: draft.id, message: 'Queued for human approval', originalRecipient: payload.to };
  }

  /**
   * Operator-initiated send (the operator clicking "send" is the approval): verifies the operator may approve for this
   * tenant, records an approved draft, then sends through the same gate.
   */
  async sendWithApprover(companyId: string, approverId: string, payload: EmailPayload): Promise<IntegrationResponse> {
    await assertOutreachActor(this.prisma, companyId, approverId, true);
    const draft = await this.prisma.outreachDraft.create({
      data: {
        companyId, recipientEmail: payload.to.trim(), recipientName: payload.businessName, subject: payload.subject, messageBody: payload.body,
        reasonForContact: payload.source ?? 'operator', salesLeadId: payload.leadId,
        status: 'SENDING', approvedBy: approverId, approvedAt: new Date(),
      },
    });
    try {
      const res = await this.sendEmail(companyId, outreachEnv(), payload, approverId, { draftId: draft.id });
      await this.prisma.outreachDraft.update({ where: { id: draft.id }, data: { status: 'SENT', sentAt: new Date() } });
      return { ...res, draftId: draft.id };
    } catch (e) {
      await this.prisma.outreachDraft.update({ where: { id: draft.id }, data: { status: 'FAILED', errorMessage: e.message } });
      throw e;
    }
  }
}
