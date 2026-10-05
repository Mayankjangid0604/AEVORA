import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { STREAM_TOKEN_TTL } from './jwt-auth.guard';
import { AuthorizationService, AuthUser } from './authorization.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  async me(user: AuthUser) {
    if (!user?.actorId) throw new UnauthorizedException();
    if (user.actorRole === 'CHAIRMAN') {
      const c = await this.prisma.chairman.findUnique({ where: { id: user.actorId }, select: { id: true, name: true, email: true } });
      if (!c) throw new UnauthorizedException('Actor no longer exists');
      return { actorId: c.id, actorType: 'CHAIRMAN', actorRole: 'CHAIRMAN', name: c.name, email: c.email, companyId: user.companyId ?? null };
    }
    const e = await this.prisma.employee.findUnique({ where: { id: user.actorId }, select: { id: true, name: true, companyId: true, status: true } });
    if (!e) throw new UnauthorizedException('Actor no longer exists');
    return { actorId: e.id, actorType: 'EMPLOYEE', actorRole: user.actorRole, name: e.name, email: null, companyId: e.companyId, status: e.status };
  }

  async capabilities(user: AuthUser) {
    if (!user?.actorId) throw new UnauthorizedException();
    if (user.actorRole === 'CHAIRMAN') {
      return { actorRole: 'CHAIRMAN', companyId: user.companyId ?? null, accessLevel: 'OWNER', permissions: [], allPermissionsInOwnedCompanies: true };
    }
    const e = await this.prisma.employee.findUnique({ where: { id: user.actorId }, select: { role: { select: { accessLevel: true, permissions: true } } } });
    const perms = Array.isArray(e?.role?.permissions) ? (e!.role!.permissions as unknown[]).filter((p): p is string => typeof p === 'string') : [];
    return { actorRole: user.actorRole, companyId: user.companyId ?? null, accessLevel: e?.role?.accessLevel ?? null, permissions: perms, allPermissionsInOwnedCompanies: false };
  }

  async companies(user: AuthUser) {
    const rows = await this.authorization.accessibleCompanies(user);
    return rows.map((c: any) => ({ id: c.id, name: c.name, status: c.status, groupId: c.groupId ?? null }));
  }

  private verifyPassword(password: string, hash: string, salt: string, algorithm: string, workFactor: number): boolean {
    if (!salt || !workFactor || workFactor < 600000) {
      return false;
    }

    if (algorithm === 'PBKDF2-SHA256' || algorithm === 'PBKDF2-SHA512') {
      const digest = algorithm.split('-')[1].toLowerCase();
      const hashed = crypto.pbkdf2Sync(password, salt, workFactor, 64, digest).toString('hex');
      const a = Buffer.from(hashed, 'hex');
      const b = Buffer.from(hash ?? '', 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    
    return false;
  }

  /** #stream-401: a 60 s token that can only open an SSE stream (EventSource can't send headers). */
  async streamToken(user: { actorId: string; actorRole: string; companyId?: string }) {
    return { token: await this.jwtService.signAsync({ actorId: user.actorId, actorRole: user.actorRole, companyId: user.companyId, purpose: 'sse' }, { expiresIn: STREAM_TOKEN_TTL }) };
  }

  async login(actorId: string, credential?: string) {
    if (!credential) {
      throw new UnauthorizedException('Credential required');
    }

    // Check if it's a chairman
    const chairman = await this.prisma.chairman.findFirst({
      where: {
        OR: [
          { id: actorId },
          { email: actorId }
        ]
      },
      include: { companies: true },
    });

    if (chairman && chairman.credentialHash) {
      const isValid = this.verifyPassword(
        credential, 
        chairman.credentialHash, 
        chairman.credentialSalt, 
        chairman.hashAlgorithm || 'PBKDF2-SHA512', 
        chairman.workFactor
      );

      if (isValid) {
        return {
          access_token: await this.jwtService.signAsync({
            actorId: chairman.id,
            actorRole: 'CHAIRMAN',
          }),
        };
      } else {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Check if it's an employee
    const employee = await this.prisma.employee.findUnique({
      where: { id: actorId },
      include: { role: true },
    });

    if (employee && employee.credentialHash) {
      const isValid = this.verifyPassword(
        credential, 
        employee.credentialHash, 
        employee.credentialSalt, 
        employee.hashAlgorithm || 'PBKDF2-SHA512', 
        employee.workFactor
      );

      if (isValid) {
        let roleName = 'EMPLOYEE';
        if (employee.role?.accessLevel === 'MANAGEMENT') {
          roleName = 'MANAGEMENT';
        } else if (employee.role?.accessLevel === 'SYSTEM') {
          roleName = 'SYSTEM';
        }
        
        return {
          access_token: await this.jwtService.signAsync({
            actorId: employee.id,
            actorRole: roleName,
            companyId: employee.companyId,
          }),
        };
      } else {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    throw new UnauthorizedException('Invalid actor ID or missing credentials');
  }
}
