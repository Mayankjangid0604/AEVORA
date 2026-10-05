import { Injectable, Logger } from '@nestjs/common';
import { EmailPayload, IntegrationResponse } from '../integration.service';

@Injectable()
export class SandboxEmailProvider {
  private readonly logger = new Logger(SandboxEmailProvider.name);

  async send(payload: EmailPayload): Promise<IntegrationResponse> {
    this.logger.log(`[SANDBOX] Email generated for ${payload.to} - Subject: ${payload.subject}`);
    return {
      success: true,
      message: 'Sandbox email logged successfully',
      referenceId: `sandbox-email-${Date.now()}`
    };
  }
}
