import { Test, TestingModule } from '@nestjs/testing';
import { V12AssistantAdapter } from './v12-assistant.adapter';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';
import { EmployeeService } from '../employee/employee.service';
import { DepartmentService } from '../department/department.service';
import { PrismaService } from '../prisma/prisma.service';
import { V12NavigationService } from './v12-navigation.service';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { V12IntentType, V12EntityType, WorldMode } from '@aevora/shared';
import { ForbiddenException } from '@nestjs/common';
import { StructuredLoggerService } from '../logger/structured-logger.service';
describe('V12AssistantAdapter', () => {
  let adapter: V12AssistantAdapter;
  let sessions: ReplaySessionService;
  let authService: jest.Mocked<AuthorizationService>;

  const mockIntelService = {
    generateCompanyIntelligence: jest.fn(),
  };
  const mockEmpService = {
    getEmployee: jest.fn(),
  };
  const mockDeptService = {
    getDepartment: jest.fn(),
  };
  const mockPrisma = {
    department: { findMany: jest.fn() },
    v12NavigationNode: { findFirst: jest.fn() },
    v12SpatialRoom: { findMany: jest.fn(), findFirst: jest.fn() },
    employee: { findMany: jest.fn() },
    v12SpatialWorkspace: { findFirst: jest.fn() }
  };
  const mockNavService = {
    requestEntityMovement: jest.fn(),
  };
  const mockAuthService = {
    checkPermission: jest.fn(),
  };

  const resetMocks = () => {
    jest.resetAllMocks();
    mockPrisma.department.findMany.mockResolvedValue([]);
    mockPrisma.v12SpatialRoom.findMany.mockResolvedValue([]);
    mockPrisma.v12SpatialRoom.findFirst.mockResolvedValue(null);
    mockPrisma.v12NavigationNode.findFirst.mockResolvedValue(null);
    mockPrisma.employee.findMany.mockResolvedValue([]);
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue(null);
    mockAuthService.checkPermission.mockResolvedValue(true);
  };

  beforeEach(async () => {
    resetMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12AssistantAdapter,
        ReplaySessionService,
        { provide: CompanyIntelligenceService, useValue: mockIntelService },
        { provide: EmployeeService, useValue: mockEmpService },
        { provide: DepartmentService, useValue: mockDeptService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: V12NavigationService, useValue: mockNavService },
        { provide: AuthorizationService, useValue: mockAuthService },
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } }
      ],
    }).compile();

    adapter = module.get<V12AssistantAdapter>(V12AssistantAdapter);
    sessions = module.get(ReplaySessionService);
    authService = module.get(AuthorizationService) as any;
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('Security Embodiment & Authorization', () => {
    it('Unauthorized action (B) via missing company context', async () => {
      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.WHO_IS_THIS,
        {
          timestamp: new Date().toISOString(),
          correlationId: 'test-1',
          selectedEntityId: 'emp1',
          selectedEntityType: V12EntityType.PERSON,
        },
        {}
      );
      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.responseText).toContain('No company context provided');
    });

    it('Unauthorized action (B) via checkPermission failure', async () => {
      mockAuthService.checkPermission.mockRejectedValue(new ForbiddenException());
      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.WHO_IS_THIS,
        {
          timestamp: new Date().toISOString(),
          correlationId: 'test-1',
          currentCompanyId: 'comp1',
        },
        {}
      );
      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.responseText).toContain('You are not authorized');
    });

    it('Cross-company spoofing rejected via auth service (C)', async () => {
      mockAuthService.checkPermission.mockRejectedValue(new ForbiddenException('Actor does not belong to this company'));
      const result = await adapter.processQuestion(
        'actor1',
        V12IntentType.WHO_IS_THIS,
        { currentCompanyId: 'comp2', timestamp: '1', correlationId: 'c' },
        {}
      );
      expect(result.status).toBe('UNAUTHORIZED');
    });

    it('No mutation on failure (J)', async () => {
      mockAuthService.checkPermission.mockRejectedValue(new ForbiddenException());
      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.NAVIGATE_TO,
        { currentCompanyId: 'c1', timestamp: '1', correlationId: '1' },
        { targetName: 'Research' }
      );
      expect(result.status).toBe('UNAUTHORIZED');
      expect(mockNavService.requestEntityMovement).not.toHaveBeenCalled();
    });
  });

  it('should handle WHO_IS_THIS with a selected employee', async () => {
    mockEmpService.getEmployee.mockResolvedValueOnce({
      id: 'emp1',
      name: 'John Doe',
      role: { title: 'Manager' },
      department: { name: 'Sales' }
    });

    const result = await adapter.processQuestion(
      'user1',
      V12IntentType.WHO_IS_THIS,
      {
        timestamp: new Date().toISOString(),
        correlationId: 'test-1',
        currentCompanyId: 'c1',
        selectedEntityId: 'emp1',
        selectedEntityType: V12EntityType.PERSON,
      },
      {}
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.responseText).toContain('John Doe');
    expect(result.responseText).toContain('Sales');
  });

  describe('Deterministic Navigation & Ambiguity', () => {
    it('returns AMBIGUOUS if multiple target matches are found', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 'd1', name: 'Sales North' },
        { id: 'd2', name: 'Sales South' }
      ]);
      mockPrisma.v12SpatialRoom.findFirst.mockImplementation(async (args: any) => {
        return { id: `space-${args.where.departmentId}` };
      });
      mockPrisma.v12NavigationNode.findFirst.mockImplementation(async (args: any) => {
        return { id: `node-${args.where.entityId}` };
      });
      mockPrisma.v12SpatialRoom.findMany.mockResolvedValue([]);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.NAVIGATE_TO,
        { currentCompanyId: 'c1', timestamp: '1', correlationId: '1' },
        { targetName: 'Sales' }
      );
      
      expect(result.status).toBe('AMBIGUOUS');
      expect(result.responseText).toContain('I found multiple matching destinations');
      expect(mockNavService.requestEntityMovement).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND if no targets are matched', async () => {
      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.NAVIGATE_TO,
        { currentCompanyId: 'c1', timestamp: '1', correlationId: '1' },
        { targetName: 'Nobody' }
      );
      
      expect(result.status).toBe('NOT_FOUND');
      expect(mockNavService.requestEntityMovement).not.toHaveBeenCalled();
    });

    it('resolves exactly one match deterministically', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 'd1', name: 'Sales North' }
      ]);
      mockPrisma.v12SpatialRoom.findFirst.mockResolvedValue({ id: 'space1' });
      mockPrisma.v12NavigationNode.findFirst.mockResolvedValue({ id: 'node1', x: 0, y: 0, z: 0 });

      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.NAVIGATE_TO,
        { currentCompanyId: 'c1', timestamp: '1', correlationId: '1' },
        { targetName: 'Sales' }
      );
      
      expect(result.status).toBe('SUCCESS');
      expect(mockNavService.requestEntityMovement).toHaveBeenCalled();
    });
  });

  describe('Replay Mode constraints', () => {
    it('returns REPLAY_READ_ONLY for consequential intents during replay', async () => {
      sessions.enter('user1', 'c1');
      const result = await adapter.processQuestion(
        'user1',
        V12IntentType.NAVIGATE_TO,
        { currentCompanyId: 'c1', timestamp: '1', correlationId: '1' },
        { targetName: 'Sales' },
        WorldMode.REPLAY
      );
      
      expect(result.status).toBe('REPLAY_READ_ONLY');
      expect(mockNavService.requestEntityMovement).not.toHaveBeenCalled();
      
      sessions.exit('user1');
    });
  });
});
