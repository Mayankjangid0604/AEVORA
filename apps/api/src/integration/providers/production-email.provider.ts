import { blockedInSafeMode, safeMode } from '../../common/safe-mode';
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailPayload, IntegrationResponse } from '../integration.service';
import { companyProfile } from '../../config/company';

@Injectable()
export class ProductionEmailProvider {
  private readonly logger = new Logger(ProductionEmailProvider.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || '';
    this.fromEmail = process.env.FROM_EMAIL || '';
  }

  async send(payload: EmailPayload): Promise<IntegrationResponse> {
    if (safeMode()) blockedInSafeMode('outreach email', (l) => this.logger.warn(l)); // #49: SMTP isn't fetch, so check here
    if (process.env.SMTP_HOST) return this.sendSmtp(payload);

    if (!this.apiKey) {
      throw new Error('Production email provider is not configured properly (missing SENDGRID_API_KEY).');
    }

    if (!payload.to) {
      throw new Error('Recipient email is required.');
    }

    this.logger.log(`[PRODUCTION EMAIL] Sending email to ${payload.to} - Subject: ${payload.subject}`);

    try {
      // In a real implementation, we would use the sendgrid SDK or fetch API.
      // E.g., await sgMail.send({...})
      
      // For this implementation, we construct the request that would be sent.
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: this.fromEmail },
          subject: payload.subject,
          content: [{ type: 'text/plain', value: payload.body }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`SendGrid API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      this.logger.log(`[PRODUCTION EMAIL] Successfully sent email to ${payload.to}`);

      return {
        success: true,
        message: 'Email dispatched to SendGrid successfully',
        referenceId: `prod-email-${Date.now()}`
      };
    } catch (error) {
      this.logger.error(`[PRODUCTION EMAIL] Failed to send email to ${payload.to}: ${error.message}`);
      throw error;
    }
  }

  private transporter?: nodemailer.Transporter;

  /** SMTP (e.g. Gmail app password) — preferred over SendGrid when SMTP_HOST is set. */
  private async sendSmtp(payload: EmailPayload): Promise<IntegrationResponse> {
    if (!payload.to) throw new Error('Recipient email is required.');
    this.transporter ??= nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') }, // Gmail shows app passwords with spaces
    });
    const info = await this.transporter.sendMail({
      from: `"${payload.senderName ?? process.env.OUTREACH_FROM_NAME ?? companyProfile().name}" <${process.env.SMTP_USER}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
    });
    this.logger.log(`[SMTP] Sent email to ${payload.to} (${info.messageId})`);
    return { success: true, message: 'Sent via SMTP', referenceId: info.messageId };
  }
}
