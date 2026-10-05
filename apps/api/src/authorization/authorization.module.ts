import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        if (!process.env.JWT_SECRET) {
          throw new Error('JWT_SECRET environment variable is missing. Application cannot start securely.');
        }
        return {
          global: true,
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthorizationService, PrismaService, JwtAuthGuard, { provide: APP_GUARD, useExisting: JwtAuthGuard }, RolesGuard, AuthService],
  exports: [AuthorizationService, JwtAuthGuard, RolesGuard, JwtModule, AuthService],
})
export class AuthorizationModule {}
