import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, IntegrationStatus } from '@prisma/client';
import { LocalTestResearchProvider } from './providers/local-test-research.provider';
import { ExternalSearchProvider } from './providers/external-search.provider';
import { ResearchQuery, ResearchResultData } from './providers/research-provider.interface';
import { StructuredLoggerService } from '../logger/structured-logger.service';

@Injectable()
export class ResearchIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly localProvider: LocalTestResearchProvider,
    private readonly externalProvider: ExternalSearchProvider,
    private readonly logger: StructuredLoggerService
  ) {}

  async search(
    companyId: string,
    environment: ExecutionEnvironment,
    query: ResearchQuery,
    actorId?: string,
  ): Promise<ResearchResultData[]> {
    const auditLog = await this.prisma.integrationAuditLog.create({
      data: {
        companyId,
        action: 'EXTERNAL_RESEARCH',
        environment,
        status: 'PENDING',
        requestPayload: JSON.parse(JSON.stringify(query)),
        actorId,
      },
    });

    try {
      let results: ResearchResultData[];

      if (environment === ExecutionEnvironment.SIMULATION || environment === ExecutionEnvironment.SANDBOX) {
        this.logger.log(`[${environment}] Delegating research to LocalTestResearchProvider`, ResearchIntegrationService.name);
        results = await this.localProvider.search(query);
      } else {
        const providerConfig = await this.prisma.providerIntegration.findFirst({
          where: {
            companyId,
            capabilityType: 'SEARCH',
            environment,
            status: IntegrationStatus.ACTIVE,
          },
        });

        if (!providerConfig) {
           this.logger.log(`[${environment}] No active research provider found. Failing safely.`);
           throw new Error('NOT_IMPLEMENTED: No active research provider configured for PRODUCTION');
        }
        
        results = await this.externalProvider.search(query);
      }

      await this.prisma.integrationAuditLog.update({
        where: { id: auditLog.id },
        data: {
          status: 'SUCCESS',
          responsePayload: JSON.parse(JSON.stringify({ resultCount: results.length })),
        },
      });

      return results;
    } catch (error) {
      await this.prisma.integrationAuditLog.update({
        where: { id: auditLog.id },
        data: {
          status: 'FAILED',
          error: error.message,
        },
      });
      throw error;
    }
  }
}
