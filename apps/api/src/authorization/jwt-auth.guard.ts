import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { INTEGRATION_AUTH_KEY } from './integration-api-key.guard';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** SSE routes (EventSource can't send headers): accept a short-lived `purpose: 'sse'` token in ?token=. */
export const QUERY_TOKEN_KEY = 'queryToken';
export const StreamTokenAuth = () => SetMetadata(QUERY_TOKEN_KEY, true);
export const STREAM_TOKEN_TTL = '60s';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    if (request.user) return true; // already verified by the global guard

    const [type, header] = request.headers.authorization?.split(' ') ?? [];
    const streamRoute = this.reflector.getAllAndOverride<boolean>(QUERY_TOKEN_KEY, [context.getHandler(), context.getClass()]);
    const query = streamRoute && typeof request.query?.token === 'string' ? request.query.token : null;
    const token = type === 'Bearer' && header ? header : query;
    if (!token) {
      // Defer to IntegrationApiKeyGuard on routes that accept integration auth
      const integrationAuth = this.reflector.getAllAndOverride<boolean>(INTEGRATION_AUTH_KEY, [context.getHandler(), context.getClass()]);
      if (integrationAuth && request.headers['x-integration-key']) return true;
      throw new UnauthorizedException('Authentication token missing');
    }
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: process.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token'); // never echo or log the token
    }
    // A stream token only opens a stream (query param), and a session token never travels in a URL.
    if ((token === query) !== (payload?.purpose === 'sse')) throw new UnauthorizedException('Wrong token type for this route');
    request.user = payload;
    return true;
  }
}
