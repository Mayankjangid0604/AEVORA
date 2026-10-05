import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntelligenceController } from './controllers/intelligence.controller';
import { CompanyIntelligenceController } from '../company-intelligence/company-intelligence.controller';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';
import { GroupIntelligenceService } from '../company-intelligence/group-intelligence.service';
import { OrganizationController } from '../organization/organization.controller';
import { OrganizationService } from '../organization/organization.service';
import { EmployeeService } from '../employee/employee.service';
import { WorkerProfileService } from '../workforce/worker-profile.service';

/** V14 closure: intelligence reads are bound to the caller's company and fail closed without one. */
describe('Intelligence isolation over HTTP', () => {
  const SECRET = 'v14-intel-secret';
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const SESSION_B = '33333333-3333-4333-8333-333333333333';
  let app: any;
  let jwt: JwtService;
  const sessions = [{ id: SESSION_B, companyId: B }];
  const prisma: any = {
    company: { findFirst: jest.fn(async ({ where }: any) => (where.chairmanId === 'chair-A' && (!where.id || where.id === A) ? { id: A } : null)) },
    employee: { findUnique: jest.fn(async ({ where }: any) => ({ 'emp-B': { companyId: B }, 'emp-A': { companyId: A } } as any)[where.id] ?? null) },
    intelligenceSession: { findFirst: jest.fn(async ({ where }: any) => sessions.find(s => s.id === where.id && s.companyId === where.companyId) ?? null) },
  };
  const companyIntel = { generateCompanyIntelligence: jest.fn(async () => ({})) };
  const org = { getDepartments: jest.fn(async () => []) };
  const employees = { getEmployee: jest.fn(async (id: string) => ({ id })), getHistory: jest.fn(async () => []) };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [IntelligenceController, CompanyIntelligenceController, OrganizationController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CompanyIntelligenceService, useValue: companyIntel },
        { provide: GroupIntelligenceService, useValue: {} },
        { provide: OrganizationService, useValue: org },
        { provide: EmployeeService, useValue: employees },
        { provide: WorkerProfileService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app?.close());

  const http = () => request(app.getHttpServer());
  const empA = () => `Bearer ${jwt.sign({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: A })}`;
  const companylessChair = () => `Bearer ${jwt.sign({ actorId: 'chair-none', actorRole: 'CHAIRMAN' })}`;

  it("another company's intelligence session is 404", () =>
    http().get(`/intelligence/sessions/${SESSION_B}`).set('Authorization', empA()).expect(404));

  it('company intelligence for another company is 403', () =>
    http().get(`/company-intelligence/company/${B}`).set('Authorization', `Bearer ${jwt.sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' })}`).expect(403));

  it('a chairman with no company context cannot read an arbitrary company (fail closed)', async () => {
    await http().get(`/company-intelligence/company/${B}`).set('Authorization', companylessChair()).expect(403);
    await http().get(`/intelligence/sessions/${SESSION_B}`).set('Authorization', companylessChair()).expect(404);
    expect(companyIntel.generateCompanyIntelligence).not.toHaveBeenCalled();
  });

  it('a company-less chairman reaches company-scoped services with null, never undefined (no all-company query)', async () => {
    await http().get('/organization/departments').set('Authorization', companylessChair());
    expect(org.getDepartments).toHaveBeenCalledWith(null);
  });

  it('GET /organization/employee/:id and /history hide other tenants (404) and serve own company', async () => {
    await http().get('/organization/employee/emp-B').set('Authorization', empA()).expect(404);
    await http().get('/organization/employee/emp-B/history').set('Authorization', empA()).expect(404);
    expect(employees.getEmployee).not.toHaveBeenCalled();
    expect(employees.getHistory).not.toHaveBeenCalled();
    await http().get('/organization/employee/emp-A').set('Authorization', empA()).expect(200);
    await http().get('/organization/employee/emp-A/history').set('Authorization', empA()).expect(200);
  });
});
