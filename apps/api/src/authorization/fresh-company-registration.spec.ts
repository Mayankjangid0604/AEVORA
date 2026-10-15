import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Fresh Company Registration and Activation', () => {
  let authService: AuthService;
  let prismaMock: any;

  const mockDb: Record<string, any[]> = {
    chairman: [],
    company: [],
    department: [],
    role: [
      { id: 'role-mgmt', name: 'Executive Management', accessLevel: 'MANAGEMENT', permissions: ['*'], companyId: null },
    ],
    employee: [],
    realMoneyAccount: [],
    acWallet: [],
    companyEvent: [],
  };

  beforeEach(async () => {
    mockDb.chairman = [];
    mockDb.company = [];
    mockDb.department = [];
    mockDb.employee = [];
    mockDb.realMoneyAccount = [];
    mockDb.acWallet = [];
    mockDb.companyEvent = [];

    prismaMock = {
      chairman: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id) return mockDb.chairman.find((c) => c.id === where.id) || null;
          if (where.email) return mockDb.chairman.find((c) => c.email.toLowerCase() === where.email.toLowerCase()) || null;
          return null;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (where.OR) {
            for (const cond of where.OR) {
              if (cond.id) {
                const found = mockDb.chairman.find((c) => c.id === cond.id);
                if (found) return found;
              }
              if (cond.email) {
                const found = mockDb.chairman.find((c) => c.email.toLowerCase() === cond.email.toLowerCase());
                if (found) return found;
              }
            }
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          const row = { id: `chair-${Date.now()}`, ...data, companies: [] };
          mockDb.chairman.push(row);
          return row;
        }),
      },
      employee: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return mockDb.employee.find((e) => e.id === where.id) || null;
        }),
      },
      role: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          return mockDb.role.find((r) => r.accessLevel === where.accessLevel) || mockDb.role[0];
        }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        const tx = {
          chairman: {
            findUnique: prismaMock.chairman.findUnique,
            create: prismaMock.chairman.create,
          },
          company: {
            findFirst: jest.fn().mockImplementation(async ({ where }) => {
              return mockDb.company.find((c) => c.chairmanId === where.chairmanId && c.name.toLowerCase() === where.name.toLowerCase()) || null;
            }),
            create: jest.fn().mockImplementation(async ({ data }) => {
              const depts = (data.departments?.create || []).map((d: any, idx: number) => ({ id: `dept-${idx}`, ...d }));
              const row = { id: `comp-${Date.now()}`, ...data, departments: depts, status: 'ACTIVE' };
              mockDb.company.push(row);
              return row;
            }),
          },
          department: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `dept-${Date.now()}`, ...data };
              mockDb.department.push(row);
              return row;
            }),
          },
          role: {
            findFirst: prismaMock.role.findFirst,
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `role-${Date.now()}`, ...data };
              mockDb.role.push(row);
              return row;
            }),
          },
          employee: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `emp-${Date.now()}`, ...data };
              mockDb.employee.push(row);
              return row;
            }),
          },
          realMoneyAccount: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `rma-${Date.now()}`, ...data };
              mockDb.realMoneyAccount.push(row);
              return row;
            }),
          },
          aCWallet: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `acw-${Date.now()}`, ...data };
              mockDb.acWallet.push(row);
              return row;
            }),
          },
          acWallet: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `acw-${Date.now()}`, ...data };
              mockDb.acWallet.push(row);
              return row;
            }),
          },
          companyEvent: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              const row = { id: `ev-${Date.now()}`, ...data };
              mockDb.companyEvent.push(row);
              return row;
            }),
          },
        };
        return callback(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'fresh-registration-secret-key-12345',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [
        AuthService,
        {
          provide: AuthorizationService,
          useValue: { accessibleCompanies: jest.fn() },
        },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(
      authService.registerCompany({
        companyName: 'Apex Logistics',
        adminName: 'Jane Doe',
        adminEmail: 'jane@apex.com',
        password: 'short',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects empty company name or admin name', async () => {
    await expect(
      authService.registerCompany({
        companyName: '   ',
        adminName: 'Jane Doe',
        adminEmail: 'jane@apex.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('successfully registers a fresh company and returns session token', async () => {
    const res = await authService.registerCompany({
      companyName: 'Apex Global Logistics',
      legalName: 'Apex Global Logistics LLC',
      adminName: 'Jane Doe',
      adminEmail: 'jane@apex-logistics.com',
      password: 'StrongBusinessPassword#2026',
    });

    expect(res).toBeDefined();
    expect(res.access_token).toBeDefined();
    expect(res.company).toBeDefined();
    expect(res.company.name).toBe('Apex Global Logistics');
    expect(res.company.legalName).toBe('Apex Global Logistics LLC');
    expect(res.chairman.email).toBe('jane@apex-logistics.com');

    // Verify database state in mock
    expect(mockDb.chairman.length).toBe(1);
    expect(mockDb.company.length).toBe(1);
    expect(mockDb.company[0].departments.length).toBe(4);
    expect(mockDb.employee.length).toBe(1);
    expect(mockDb.realMoneyAccount.length).toBe(1);
    expect(mockDb.acWallet.length).toBe(1);
    expect(mockDb.companyEvent.length).toBe(1);
    expect(mockDb.companyEvent[0].type).toBe('COMPANY_CREATED');

    // Verify stored credential is a PBKDF2 hash, not plaintext
    expect(mockDb.chairman[0].credentialHash).toBeDefined();
    expect(mockDb.chairman[0].credentialSalt).toBeDefined();
    expect(mockDb.chairman[0].workFactor).toBe(600000);
    expect(mockDb.chairman[0].credentialHash).not.toContain('StrongBusinessPassword');
  });

  it('authenticates the freshly registered chairman credentials with login()', async () => {
    await authService.registerCompany({
      companyName: 'Horizon Software',
      adminName: 'Alex Vance',
      adminEmail: 'alex@horizon.io',
      password: 'HorizonPassword456$',
    });

    const loginRes = await authService.login('alex@horizon.io', 'HorizonPassword456$');
    expect(loginRes).toBeDefined();
    expect(loginRes.access_token).toBeDefined();

    // Fails with wrong password
    await expect(authService.login('alex@horizon.io', 'WrongPassword')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects registration with an email that is already registered with different password', async () => {
    await authService.registerCompany({
      companyName: 'First Company',
      adminName: 'Owner One',
      adminEmail: 'owner@business.com',
      password: 'PasswordOne123!',
    });

    await expect(
      authService.registerCompany({
        companyName: 'Second Company',
        adminName: 'Owner Two',
        adminEmail: 'owner@business.com',
        password: 'PasswordTwo456!',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
