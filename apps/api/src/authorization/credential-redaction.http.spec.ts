import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of } from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthorizationService } from './authorization.service';
import { CredentialRedactionInterceptor, redactCredentials } from './credential-redaction.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationController } from '../organization/organization.controller';
import { OrganizationService } from '../organization/organization.service';
import { EmployeeService } from '../employee/employee.service';
import { WorkerProfileService } from '../workforce/worker-profile.service';

/** V14 slice 3: Employee rows returned by many routes carried credential hashes/salts to any company member. */
describe('Credential redaction', () => {
  const row = () => ({
    id: 'emp-A', name: 'Asha', companyId: 'A', salary: 100,
    credentialHash: 'HASH-SECRET', credentialSalt: 'SALT-SECRET', hashAlgorithm: 'PBKDF2-SHA512', workFactor: 600000,
    hireDate: new Date('2026-01-01T00:00:00Z'),
    role: { id: 'r', title: 'Engineer' }, department: { id: 'd', name: 'Eng' },
  });

  it('strips credential fields recursively and leaves other values intact', () => {
    const body = { company: { id: 'A' }, employees: [row(), { nested: [row()] }] };
    redactCredentials(body);
    const json = JSON.stringify(body);
    for (const s of ['HASH-SECRET', 'SALT-SECRET', 'PBKDF2', 'workFactor', 'credentialHash']) expect(json).not.toContain(s);
    expect(body.employees[0]).toMatchObject({ id: 'emp-A', name: 'Asha', role: { title: 'Engineer' } });
    expect((body.employees[0] as any).hireDate).toBeInstanceOf(Date);
  });

  it('does not walk into non-plain values (observables, dates) and survives cycles', () => {
    const obs = of(1);
    expect(redactCredentials(obs)).toBe(obs);
    const a: any = { credentialHash: 'x' };
    a.self = a;
    expect(() => redactCredentials(a)).not.toThrow();
    expect(a.credentialHash).toBeUndefined();
  });

  describe('over HTTP (global interceptor)', () => {
    const SECRET = 'v14-redaction-secret';
    let app: any;
    let jwt: JwtService;
    const employees = { listEmployees: jest.fn(async () => [row()]), getEmployee: jest.fn(async () => row()) };

    beforeAll(async () => {
      process.env.JWT_SECRET = SECRET;
      const moduleRef = await Test.createTestingModule({
        imports: [JwtModule.register({ secret: SECRET })],
        controllers: [OrganizationController],
        providers: [
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_INTERCEPTOR, useClass: CredentialRedactionInterceptor },
          AuthorizationService,
          { provide: PrismaService, useValue: { employee: { findUnique: jest.fn(async () => ({ companyId: 'A' })) } } },
          { provide: OrganizationService, useValue: {} },
          { provide: EmployeeService, useValue: employees },
          { provide: WorkerProfileService, useValue: {} },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      jwt = moduleRef.get(JwtService);
    });
    afterAll(() => app?.close());

    it.each(['/organization/employees', '/organization/employee/emp-A'])('%s never returns credential material', async (path) => {
      const res = await request(app.getHttpServer()).get(path)
        .set('Authorization', `Bearer ${jwt.sign({ actorId: 'emp-B', actorRole: 'EMPLOYEE', companyId: 'A' })}`).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/HASH-SECRET|SALT-SECRET|credentialHash|credentialSalt|hashAlgorithm|workFactor/);
      expect(JSON.stringify(res.body)).toContain('Asha');
    });
  });
});
