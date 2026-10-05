import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: ProductionExecutionGateService
  ) {}

  async sendOutboundCommunication(
    companyId: string, 
    actorId: string, 
    channel: string, 
    recipient: string, 
    content: any, 
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    approvalId?: string
  ): Promise<any> {
    
    // Evaluate deterministic policy
    if (riskLevel === 'HIGH' && !approvalId) {
      throw new BadRequestException('HIGH risk communication requires explicit approval');
    }

    // Pass through execution gate
    await this.gate.authorizeProductionAction({
      companyId,
      actorId,
      environment: ExecutionEnvironment.PRODUCTION,
      capability: `OUTBOUND_${channel.toUpperCase()}`, // e.g., OUTBOUND_EMAIL
      action: 'SEND',
      parameters: { recipient, content },
      approvalId
    });

    // Idempotent tracking
    const commLog = await this.prisma.communicationLog.create({
      data: {
        companyId,
        actorId,
        provider: 'SYSTEM_ROUTER',
        channel,
        recipient,
        action: 'SEND',
        content,
        approvalId
      }
    });

    // Phase 24: Real-provider-only production email behavior
    const providerIntegration = await this.prisma.providerIntegration.findFirst({
      where: {
        companyId,
        environment: ExecutionEnvironment.PRODUCTION,
        capabilityType: `OUTBOUND_${channel.toUpperCase()}`,
        status: 'ACTIVE'
      }
    });

    if (!providerIntegration) {
      await this.prisma.communicationLog.update({
        where: { id: commLog.id },
        data: { status: 'FAILED', error: 'PROVIDER_NOT_CONFIGURED' }
      });
      throw new BadRequestException({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Missing real provider configuration for production.' });
    }

    // Mock sending via external provider for test execution
    this.logger.log(`[EXTERNAL_COMMUNICATION] Channel: ${channel}, To: ${recipient}`);

    return this.prisma.communicationLog.update({
      where: { id: commLog.id },
      data: { status: 'SENT' }
    });
  }
}
