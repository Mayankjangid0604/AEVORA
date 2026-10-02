import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, BadRequestException, SetMetadata } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const INTEGRATION_AUTH_KEY = 'integrationAuth';
export const IntegrationAuth = () => SetMetadata(INTEGRATION_AUTH_KEY, true);

/**
 * Service-to-service auth for external integrations (n8n, cron schedulers).
 * Accepts x-integration-key + x-company-id headers as an alternative to JWT.
 * Routes must be decorated with @IntegrationAuth() for this guard to activate.
 * The global JwtAuthGuard skips its throw when it sees the integration header
 * on a route marked @IntegrationAuth(), letting this guard handle auth instead.
 */
@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest();

    if (request.user) return true;

    const key = request.headers['x-integration-key'];
    if (!key || typeof key !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const configured = process.env.INTEGRATION_API_KEY;
    if (!configured) {
      throw new UnauthorizedException('Integration authentication is not configured');
    }

    const keyBuf = Buffer.from(key);
    const expectedBuf = Buffer.from(configured);
    if (keyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(keyBuf, expectedBuf)) {
      throw new UnauthorizedException('Invalid integration key');
    }

    const companyId = request.headers['x-company-id'];
    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException('x-company-id header is required for integration authentication');
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      throw new BadRequestException('Company not found');
    }

    request.user = {
      companyId,
      actorId: 'SYSTEM_INTEGRATION',
      actorRole: 'CHAIRMAN',
    };

    return true;
  }
}
