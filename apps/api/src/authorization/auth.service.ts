import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
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

  hashPassword(password: string): { hash: string; salt: string; algorithm: string; workFactor: number } {
    const salt = crypto.randomBytes(32).toString('hex');
    const workFactor = 600000;
    const algorithm = 'PBKDF2-SHA512';
    const hash = crypto.pbkdf2Sync(password, salt, workFactor, 64, 'sha512').toString('hex');
    return { hash, salt, algorithm, workFactor };
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

  /**
   * Fresh company onboarding. Creates the company, its initial authorized administrator (Chairman),
   * default executive department, CEO employee, AC wallet, and Real money account in one atomic transaction.
   * Never sets a default/public password; requires strong credentials.
   */
  async registerCompany(dto: {
    adminName: string;
    adminEmail: string;
    password: string;
    companyName: string;
    legalName?: string;
    description?: string;
  }) {
    const adminName = dto?.adminName?.trim();
    const adminEmail = dto?.adminEmail?.trim().toLowerCase();
    const companyName = dto?.companyName?.trim();
    const legalName = dto?.legalName?.trim() || `${companyName} Ltd.`;
    const description = dto?.description?.trim() || null;
    const password = dto?.password;

    if (!adminName || adminName.length < 2 || adminName.length > 80) {
      throw new BadRequestException('Administrator name must be between 2 and 80 characters.');
    }
    const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
    if (!adminEmail || !EMAIL_RE.test(adminEmail) || adminEmail.length > 254) {
      throw new BadRequestException('A valid administrator email address is required.');
    }
    if (!password || password.length < 8 || password.length > 128) {
      throw new BadRequestException('Password must be between 8 and 128 characters.');
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BadRequestException('Password must contain at least one letter and one number.');
    }
    if (!companyName || companyName.length < 2 || companyName.length > 120) {
      throw new BadRequestException('Company name must be between 2 and 120 characters.');
    }

    const { hash, salt, algorithm, workFactor } = this.hashPassword(password);

    const result = await this.prisma.$transaction(async (tx) => {
      let chairman = await tx.chairman.findUnique({
        where: { email: adminEmail },
      });

      if (chairman) {
        if (!chairman.credentialHash || !this.verifyPassword(password, chairman.credentialHash, chairman.credentialSalt || '', chairman.hashAlgorithm || 'PBKDF2-SHA512', chairman.workFactor || 600000)) {
          throw new ConflictException('An account with this email already exists. Please sign in or use a different email.');
        }
      } else {
        chairman = await tx.chairman.create({
          data: {
            name: adminName,
            email: adminEmail,
            credentialHash: hash,
            credentialSalt: salt,
            hashAlgorithm: algorithm,
            workFactor,
          },
        });
      }

      const existingCompany = await tx.company.findFirst({
        where: {
          chairmanId: chairman.id,
          name: companyName,
          status: 'ACTIVE',
        },
      });
      if (existingCompany) {
        throw new ConflictException('You already have an active company with this name.');
      }

      const company = await tx.company.create({
        data: {
          name: companyName,
          legalName,
          description,
          chairmanId: chairman.id,
          status: 'ACTIVE',
          departments: {
            create: [
              { name: 'Executive' },
              { name: 'Engineering' },
              { name: 'Operations' },
              { name: 'Sales' },
            ],
          },
        },
        include: { departments: true },
      });

      const executiveDept = company.departments.find((d) => d.name === 'Executive');
      if (executiveDept) {
        await tx.employee.create({
          data: {
            name: 'CEO',
            identitySeed: `${company.id}-ceo-seed`,
            status: 'ACTIVE',
            company: { connect: { id: company.id } },
            department: { connect: { id: executiveDept.id } },
            role: {
              create: {
                title: 'CEO',
                level: 1,
                accessLevel: 'MANAGEMENT',
                company: { connect: { id: company.id } },
              },
            },
          },
        });
      }

      await tx.realMoneyAccount.create({
        data: {
          companyId: company.id,
          balance: 0,
        },
      });

      await tx.aCWallet.create({
        data: {
          companyId: company.id,
          balance: 0,
        },
      });

      await tx.companyEvent.create({
        data: {
          companyId: company.id,
          type: 'COMPANY_CREATED',
          payload: {
            name: company.name,
            legalName: company.legalName,
            chairmanId: chairman.id,
            onboarding: 'FRESH_BUSINESS_ONBOARDING',
          },
        },
      });

      return { chairman, company };
    });

    const accessToken = await this.jwtService.signAsync({
      actorId: result.chairman.id,
      actorRole: 'CHAIRMAN',
    });

    return {
      access_token: accessToken,
      chairman: {
        id: result.chairman.id,
        name: result.chairman.name,
        email: result.chairman.email,
      },
      company: {
        id: result.company.id,
        name: result.company.name,
        legalName: result.company.legalName,
        status: result.company.status,
      },
    };
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
