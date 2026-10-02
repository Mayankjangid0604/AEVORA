import { Controller, Post, Body, Request, UnauthorizedException } from '@nestjs/common';
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

  @Post('stream-token')
  streamToken(@Request() req) {
    return this.authService.streamToken(req.user);
  }
}
