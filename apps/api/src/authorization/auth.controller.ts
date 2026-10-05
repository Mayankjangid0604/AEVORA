import { Controller, Get, Post, Body, Request, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: { actorId: string, credential?: string }) {
    if (!body.actorId) {
      throw new UnauthorizedException('actorId is required');
    }
    return this.authService.login(body.actorId, body.credential);
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
