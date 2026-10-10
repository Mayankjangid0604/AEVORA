import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseBrainController } from './enterprise-brain.controller';
import { EnterpriseBrainService } from './enterprise-brain.service';

describe('Enterprise Brain HTTP & Tenant Isolation (V16 Slice 1)', () => {
  const SECRET = 'v16-brain-isolation-secret';
  let app: any;
  let jwt: JwtService;

  const mockBrainService = {
    getDerivedEnterpriseState: jest.fn(async (companyId: string) => ({
      companyId,
      workforce: { totalEmployees: companyId === 'comp-A' ? 20 : 5 },
      financial: { totalRevenue: companyId === 'comp-A' ? 1000000 : 200000 },
    })),
    getRelationshipGraph: jest.fn(async (companyId: string) => ({
      companyId,
      nodes: [{ id: `root-${companyId}`, companyId }],
      edges: [],
    })),
    getTaskLineage: jest.fn(async (companyId: string, taskId: string) => {
      if (companyId === 'comp-A' && taskId === 'task-A') {
        return { taskId: 'task-A', companyId: 'comp-A', title: 'Task A' };
      }
      return null; // Denied / Not found
    }),
    getDetectedConflicts: jest.fn(async (companyId: string) => []),
    evaluateSignificance: jest.fn(async (companyId: string, body: any) => ({
      score: 80,
      tier: 'CRITICAL',
      escalateToChairman: true,
    })),
  };

  const mockPrisma: any = {
    company: {
      findFirst: jest.fn(async ({ where }) => {
        const id = where?.id ?? (where?.chairmanId ? 'comp-A' : null);
        return id ? { id, name: `Company ${id}` } : null;
      }),
      findUnique: jest.fn(async ({ where }) => {
        if (where.id === 'comp-A' || where.id === 'comp-B') return { id: where.id, name: `Company ${where.id}` };
        return null;
      }),
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [EnterpriseBrainController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        RolesGuard,
        AuthorizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EnterpriseBrainService, useValue: mockBrainService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(() => app?.close());
  beforeEach(() => jest.clearAllMocks());

  const authHeader = (companyId: string, role = 'CHAIRMAN') => {
    const token = jwt.sign({
      sub: `user-${companyId}`,
      email: `user@${companyId}.com`,
      companyId,
      actorRole: role,
      role,
      actorType: 'USER',
      actorId: `actor-${companyId}`,
    });
    return `Bearer ${token}`;
  };

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    await request(app.getHttpServer()).get('/enterprise-brain/state').expect(401);
    await request(app.getHttpServer()).get('/enterprise-brain/graph').expect(401);
  });

  it('strictly isolates company state: Company A token receives Company A data only', async () => {
    const res = await request(app.getHttpServer())
      .get('/enterprise-brain/state')
      .set('Authorization', authHeader('comp-A'))
      .set('x-company-id', 'comp-A')
      .expect(200);

    expect(res.body.companyId).toBe('comp-A');
    expect(res.body.workforce.totalEmployees).toBe(20);
    expect(mockBrainService.getDerivedEnterpriseState).toHaveBeenCalledWith('comp-A');
  });

  it('strictly isolates company state: Company B token receives Company B data only', async () => {
    const res = await request(app.getHttpServer())
      .get('/enterprise-brain/state')
      .set('Authorization', authHeader('comp-B'))
      .set('x-company-id', 'comp-B')
      .expect(200);

    expect(res.body.companyId).toBe('comp-B');
    expect(res.body.workforce.totalEmployees).toBe(5);
    expect(mockBrainService.getDerivedEnterpriseState).toHaveBeenCalledWith('comp-B');
  });

  it('prevents cross-company task lineage inspection', async () => {
    // Company A actor querying task-B (belongs to Company B) -> returns null / cannot inspect
    const res = await request(app.getHttpServer())
      .get('/enterprise-brain/lineage/task/task-B')
      .set('Authorization', authHeader('comp-A'))
      .set('x-company-id', 'comp-A')
      .expect(200);

    expect(res.body).toEqual({}); // Empty / null body
    expect(mockBrainService.getTaskLineage).toHaveBeenCalledWith('comp-A', 'task-B');
  });

  it('allows Chairman/Management to evaluate significance', async () => {
    const res = await request(app.getHttpServer())
      .post('/enterprise-brain/evaluate-significance')
      .set('Authorization', authHeader('comp-A', 'CHAIRMAN'))
      .set('x-company-id', 'comp-A')
      .send({
        domain: 'FINANCE',
        entityType: 'PAYMENT',
        entityId: 'p-1',
        title: 'Large invoice unpaid',
        riskLevel: 'HIGH',
      })
      .expect(201);

    expect(res.body.tier).toBe('CRITICAL');
    expect(mockBrainService.evaluateSignificance).toHaveBeenCalled();
  });

  it('blocks STANDARD employee from evaluating executive significance with 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .post('/enterprise-brain/evaluate-significance')
      .set('Authorization', authHeader('comp-A', 'STANDARD'))
      .set('x-company-id', 'comp-A')
      .send({
        domain: 'FINANCE',
        entityType: 'PAYMENT',
        entityId: 'p-1',
        title: 'Large invoice unpaid',
      })
      .expect(403);
  });
});
