import { Controller, Get, Post, Body, Request, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() body: { actorId: string, credential?: string }) {
    if (!body.actorId) {
      throw new UnauthorizedException('actorId is required');
    }
    return this.authService.login(body.actorId, body.credential);
  }

  /** Public onboarding: register a brand new company and its initial Chairman administrator. */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register-company')
  async registerCompany(
    @Body() body: {
      adminName: string;
      adminEmail: string;
      password: string;
      companyName: string;
      legalName?: string;
      description?: string;
    },
  ) {
    return this.authService.registerCompany(body);
  }

  /** Authoritative identity of the bearer, resolved from the verified token + database (no secrets). */
  @Get('me')
  me(@Request() req) {
    return this.authService.me(req.user);
  }

  /** Coarse capability hints for UX only; every endpoint still enforces its own authorization. */
  @Get('capabilities')
  capabilities(@Request() req) {
    return this.authService.capabilities(req.user);
  }

  /** Companies the authenticated actor can access (derived from the token, never from client input). */
  @Get('companies')
  companies(@Request() req) {
    return this.authService.companies(req.user);
  }

  @Post('stream-token')
  streamToken(@Request() req) {
    return this.authService.streamToken(req.user);
  }
}
