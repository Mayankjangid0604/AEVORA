import { Test, TestingModule } from '@nestjs/testing';
import { ProjectDeliveryController } from './project-delivery.controller';
import { ProjectIntakeService } from './project-intake.service';
import { ScopeBudgetAssessmentService } from './scope-budget-assessment.service';
import { FactoryPlanningService } from './factory-planning.service';
import { GovernedToolRouterService } from './governed-tool-router.service';
import { FactoryWorkspaceService } from './factory-workspace.service';
import { FactoryBuildOrchestratorService } from './factory-build-orchestrator.service';
import { FactoryQualityGateService } from './factory-quality-gate.service';
import { FactoryDeploymentService } from './factory-deployment.service';
import { FactoryDeliveryHandoverService } from './factory-delivery-handover.service';
import { FactorySafeCleanupService } from './factory-safe-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DeploymentEnvironment, QualityGateStatus } from './project-delivery.types';

import { JwtModule } from '@nestjs/jwt';

describe('ProjectDeliveryController — Security & Authorization Hardening', () => {
  let controller: ProjectDeliveryController;
  let rolesGuard: RolesGuard;
  let _authzService: AuthorizationService;

  const mockCompanyId = 'company-tenant-alpha';
  const foreignCompanyId = 'company-tenant-beta';
  const mockProjectId = 'project-alpha-001';
  const mockDeliveryId = 'delivery-alpha-001';

  const mockChairmanUser = {
    actorId: 'chairman-user-id',
    actorRole: 'CHAIRMAN',
    companyId: mockCompanyId,
  };

  const mockManagementUser = {
    actorId: 'manager-user-id',
    actorRole: 'MANAGEMENT',
    companyId: mockCompanyId,
  };

  const mockEmployeeUser = {
    actorId: 'employee-user-id',
    actorRole: 'EMPLOYEE',
    companyId: mockCompanyId,
  };

  const mockClientUser = {
    actorId: 'client-user-id',
    actorRole: 'CLIENT',
    companyId: mockCompanyId,
  };

  const mockOtherClientUser = {
    actorId: 'other-client-id',
    actorRole: 'CLIENT',
    companyId: mockCompanyId,
  };

  const mockForeignUser = {
    actorId: 'foreign-manager-id',
    actorRole: 'MANAGEMENT',
    companyId: foreignCompanyId,
  };

  const mockPrisma = {
    project: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === mockProjectId) {
          return Promise.resolve({
            id: mockProjectId,
            name: 'Alpha Software Project',
            companyId: mockCompanyId,
            status: 'PLANNED',
            quotedPrice: 1000000,
            estimatedCost: 600000,
            margin: 40,
            requirements: [],
            plans: [],
            milestones: [],
            risks: [],
            buildExecutions: [],
            testExecutions: [],
            deliveries: [],
            acceptances: [],
          });
        }
        return Promise.resolve(null);
      }),
    },
  };

  const mockIntakeService = {
    processIntake: jest.fn().mockResolvedValue({ status: 'PROCESSED' }),
  };
  const mockAssessmentService = {
    assessProjectScopeAndBudget: jest.fn().mockResolvedValue({ complexity: 'LOW' }),
  };
  const mockPlanningService = {
    createDecomposedPlan: jest.fn().mockResolvedValue({ milestones: [] }),
  };
  const mockToolRouter = {
    determineToolRouting: jest.fn().mockResolvedValue({ target: 'CLAUDE_CODE' }),
    executeGovernedGeneration: jest.fn().mockResolvedValue({ generatedFiles: 3 }),
  };
  const mockWorkspaceService = {
    allocateWorkspace: jest.fn().mockResolvedValue({ localPath: '/workspace/dir' }),
    resolveAndVerifyCanonicalWorkspace: jest.fn().mockImplementation((companyId, projectId, candidate) => {
      if (candidate && candidate.includes('..')) {
        throw new BadRequestException('Security violation: Supplied workspaceDir does not match canonical project workspace');
      }
      return `/workspace/${companyId}/${projectId}`;
    }),
  };
  const mockBuildOrchestrator = {
    orchestratePipeline: jest.fn().mockResolvedValue({ buildSuccess: true }),
  };
  const mockQualityGateService = {
    evaluateQualityGate: jest.fn().mockResolvedValue({ gateStatus: 'PASSED' }),
  };
  const mockDeploymentService = {
    deployProject: jest.fn().mockResolvedValue({ deployed: true }),
  };
  const mockHandoverService = {
    prepareDeliveryPackage: jest.fn().mockResolvedValue({ packageId: 'pkg-1' }),
    clientAcceptHandover: jest.fn().mockResolvedValue({ accepted: true }),
    clientRequestRevision: jest.fn().mockResolvedValue({ revised: true }),
  };
  const mockCleanupService = {
    executeSafeCleanup: jest.fn().mockResolvedValue({ cleaned: true }),
  };

  const mockAuthz = {
    assertCompanyAccess: jest.fn().mockImplementation((user, compId) => {
      if (!user || user.companyId !== compId) {
        throw new ForbiddenException('You do not have access to this company');
      }
      return Promise.resolve();
    }),
    assertResourceAccess: jest.fn().mockImplementation((user, model, id) => {
      if (model === 'project') {
        if (id === mockProjectId) {
          if (user.companyId !== mockCompanyId) {
            throw new NotFoundException('Resource not found');
          }
          return Promise.resolve(mockCompanyId);
        }
        throw new NotFoundException('Resource not found');
      }
      return Promise.resolve(user.companyId);
    }),
    assertProjectChildAccess: jest.fn().mockImplementation((user, model, id) => {
      if (id === mockDeliveryId) {
        if (user.companyId !== mockCompanyId) {
          throw new NotFoundException('Resource not found');
        }
        return Promise.resolve(mockProjectId);
      }
      throw new NotFoundException('Resource not found');
    }),
    assertDeliveryClientAccess: jest.fn().mockImplementation((user, deliveryId) => {
      if (deliveryId !== mockDeliveryId) {
        throw new NotFoundException('Resource not found');
      }
      if (user.companyId !== mockCompanyId) {
        throw new NotFoundException('Resource not found');
      }
      if (user.actorRole === 'CLIENT' && user.actorId !== mockClientUser.actorId) {
        throw new ForbiddenException('Client is not authorized for this project delivery');
      }
      return Promise.resolve({
        projectId: mockProjectId,
        companyId: mockCompanyId,
        clientId: mockClientUser.actorId,
      });
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [ProjectDeliveryController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProjectIntakeService, useValue: mockIntakeService },
        { provide: ScopeBudgetAssessmentService, useValue: mockAssessmentService },
        { provide: FactoryPlanningService, useValue: mockPlanningService },
        { provide: GovernedToolRouterService, useValue: mockToolRouter },
        { provide: FactoryWorkspaceService, useValue: mockWorkspaceService },
        { provide: FactoryBuildOrchestratorService, useValue: mockBuildOrchestrator },
        { provide: FactoryQualityGateService, useValue: mockQualityGateService },
        { provide: FactoryDeploymentService, useValue: mockDeploymentService },
        { provide: FactoryDeliveryHandoverService, useValue: mockHandoverService },
        { provide: FactorySafeCleanupService, useValue: mockCleanupService },
        { provide: AuthorizationService, useValue: mockAuthz },
      ],
    }).compile();

    controller = module.get<ProjectDeliveryController>(ProjectDeliveryController);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
    _authzService = module.get<AuthorizationService>(AuthorizationService);
  });

  describe('1. Role Authorization via RolesGuard', () => {
    it('denies access to anonymous requests with no user context', () => {
      const context = {
        getType: () => 'http',
        getHandler: () => controller.processIntake,
        getClass: () => ProjectDeliveryController,
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as any;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies access to unauthorized EMPLOYEE role for CHAIRMAN/MANAGEMENT routes', () => {
      const context = {
        getType: () => 'http',
        getHandler: () => controller.processIntake,
        getClass: () => ProjectDeliveryController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockEmployeeUser }),
        }),
      } as any;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('permits authorized CHAIRMAN role', () => {
      const context = {
        getType: () => 'http',
        getHandler: () => controller.processIntake,
        getClass: () => ProjectDeliveryController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockChairmanUser }),
        }),
      } as any;

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('permits authorized MANAGEMENT role', () => {
      const context = {
        getType: () => 'http',
        getHandler: () => controller.processIntake,
        getClass: () => ProjectDeliveryController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockManagementUser }),
        }),
      } as any;

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('permits CLIENT role on client acceptance route but denies on management routes', () => {
      const acceptContext = {
        getType: () => 'http',
        getHandler: () => controller.clientAcceptDelivery,
        getClass: () => ProjectDeliveryController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockClientUser }),
        }),
      } as any;
      expect(rolesGuard.canActivate(acceptContext)).toBe(true);

      const deployContext = {
        getType: () => 'http',
        getHandler: () => controller.deployProject,
        getClass: () => ProjectDeliveryController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockClientUser }),
        }),
      } as any;
      expect(() => rolesGuard.canActivate(deployContext)).toThrow(ForbiddenException);
    });
  });

  describe('2. Tenant Isolation & Company Scoping', () => {
    it('rejects project intake when caller-supplied companyId belongs to another tenant', async () => {
      const req = { user: mockForeignUser };
      const dto = {
        companyId: mockCompanyId,
        clientId: 'client-1',
        name: 'Malicious Cross-Tenant Project',
      } as any;

      await expect(controller.processIntake(req, dto)).rejects.toThrow(ForbiddenException);
      expect(mockIntakeService.processIntake).not.toHaveBeenCalled();
    });

    it('allows project intake when caller belongs to the target company', async () => {
      const req = { user: mockChairmanUser };
      const dto = {
        companyId: mockCompanyId,
        clientId: 'client-1',
        name: 'Legitimate Project',
      } as any;

      const result = await controller.processIntake(req, dto);
      expect(result).toEqual({ status: 'PROCESSED' });
      expect(mockAuthz.assertCompanyAccess).toHaveBeenCalledWith(mockChairmanUser, mockCompanyId);
      expect(mockIntakeService.processIntake).toHaveBeenCalledWith(dto);
    });

    it('rejects workspace allocation when caller attempts cross-tenant provisioning', async () => {
      const req = { user: mockForeignUser };

      await expect(
        controller.allocateWorkspace(req, mockProjectId, mockCompanyId),
      ).rejects.toThrow(ForbiddenException);
      expect(mockWorkspaceService.allocateWorkspace).not.toHaveBeenCalled();
    });

    it('allows workspace allocation for authorized tenant', async () => {
      const req = { user: mockManagementUser };

      const res = await controller.allocateWorkspace(req, mockProjectId, mockCompanyId);
      expect(res).toEqual({ localPath: '/workspace/dir' });
      expect(mockAuthz.assertCompanyAccess).toHaveBeenCalledWith(mockManagementUser, mockCompanyId);
      expect(mockAuthz.assertResourceAccess).toHaveBeenCalledWith(mockManagementUser, 'project', mockProjectId);
      expect(mockWorkspaceService.allocateWorkspace).toHaveBeenCalledWith(mockCompanyId, mockProjectId);
    });

    it('rejects workspace cleanup across tenant boundaries', async () => {
      const req = { user: mockForeignUser };
      const cleanupBody = {
        companyId: mockCompanyId,
        workspacePath: '/workspace/dir',
        dryRun: false,
      };

      await expect(
        controller.cleanupWorkspace(req, mockProjectId, cleanupBody),
      ).rejects.toThrow(ForbiddenException);
      expect(mockCleanupService.executeSafeCleanup).not.toHaveBeenCalled();
    });

    it('allows workspace cleanup for authorized tenant with caller actorId binding', async () => {
      const req = { user: mockChairmanUser };
      const cleanupBody = {
        companyId: mockCompanyId,
        workspacePath: '/workspace/dir',
        dryRun: true,
      };

      const res = await controller.cleanupWorkspace(req, mockProjectId, cleanupBody);
      expect(res).toEqual({ cleaned: true });
      expect(mockAuthz.assertCompanyAccess).toHaveBeenCalledWith(mockChairmanUser, mockCompanyId);
      expect(mockAuthz.assertResourceAccess).toHaveBeenCalledWith(mockChairmanUser, 'project', mockProjectId);
      expect(mockCleanupService.executeSafeCleanup).toHaveBeenCalledWith({
        companyId: mockCompanyId,
        projectId: mockProjectId,
        workspacePath: `/workspace/${mockCompanyId}/${mockProjectId}`,
        dryRun: true,
        actorId: mockChairmanUser.actorId,
      });
    });
  });

  describe('3. Resource Access Authorization for Delivery Pipeline', () => {
    it('rejects assessProject for foreign tenant project (anti-enumeration 404)', async () => {
      const req = { user: mockForeignUser };
      await expect(controller.assessProject(req, mockProjectId)).rejects.toThrow(NotFoundException);
      expect(mockAssessmentService.assessProjectScopeAndBudget).not.toHaveBeenCalled();
    });

    it('allows assessProject for authorized user', async () => {
      const req = { user: mockManagementUser };
      const res = await controller.assessProject(req, mockProjectId);
      expect(res).toEqual({ complexity: 'LOW' });
      expect(mockAuthz.assertResourceAccess).toHaveBeenCalledWith(mockManagementUser, 'project', mockProjectId);
    });

    it('binds createPlan to authenticated caller actorId', async () => {
      const req = { user: mockChairmanUser };
      const res = await controller.createPlan(req, mockProjectId);
      expect(res).toEqual({ milestones: [] });
      expect(mockAuthz.assertResourceAccess).toHaveBeenCalledWith(mockChairmanUser, 'project', mockProjectId);
      expect(mockPlanningService.createDecomposedPlan).toHaveBeenCalledWith(mockProjectId, mockChairmanUser.actorId);
    });

    it('rejects deployment attempt for foreign tenant project', async () => {
      const req = { user: mockForeignUser };
      const deployBody = {
        environment: DeploymentEnvironment.PREVIEW,
        qualityGateStatus: QualityGateStatus.PASSED,
      };

      await expect(controller.deployProject(req, mockProjectId, deployBody)).rejects.toThrow(NotFoundException);
      expect(mockDeploymentService.deployProject).not.toHaveBeenCalled();
    });

    it('allows deployment for authorized user with authenticated actorId binding', async () => {
      const req = { user: mockChairmanUser };
      const deployBody = {
        environment: DeploymentEnvironment.PREVIEW,
        qualityGateStatus: QualityGateStatus.PASSED,
      };

      const res = await controller.deployProject(req, mockProjectId, deployBody);
      expect(res).toEqual({ deployed: true });
      expect(mockDeploymentService.deployProject).toHaveBeenCalledWith({
        projectId: mockProjectId,
        environment: DeploymentEnvironment.PREVIEW,
        provider: undefined,
        actorId: mockChairmanUser.actorId,
        qualityGateStatus: QualityGateStatus.PASSED,
      });
    });

    it('rejects delivery acceptance for foreign tenant delivery', async () => {
      const req = { user: mockForeignUser };
      await expect(controller.clientAcceptDelivery(req, mockDeliveryId)).rejects.toThrow(NotFoundException);
      expect(mockHandoverService.clientAcceptHandover).not.toHaveBeenCalled();
    });

    it('allows delivery acceptance for authorized client', async () => {
      const req = { user: mockClientUser };
      const res = await controller.clientAcceptDelivery(req, mockDeliveryId);
      expect(res).toEqual({ accepted: true });
      expect(mockAuthz.assertDeliveryClientAccess).toHaveBeenCalledWith(mockClientUser, mockDeliveryId);
      expect(mockHandoverService.clientAcceptHandover).toHaveBeenCalledWith(mockDeliveryId, mockClientUser.actorId);
    });

    it('denies delivery acceptance for another client in the same company', async () => {
      const req = { user: mockOtherClientUser };
      await expect(controller.clientAcceptDelivery(req, mockDeliveryId)).rejects.toThrow(ForbiddenException);
      expect(mockHandoverService.clientAcceptHandover).not.toHaveBeenCalled();
    });

    it('allows revision request for authorized client', async () => {
      const req = { user: mockClientUser };
      const res = await controller.clientRequestRevision(req, mockDeliveryId, { revisionNotes: 'Update colors' });
      expect(res).toEqual({ revised: true });
      expect(mockAuthz.assertDeliveryClientAccess).toHaveBeenCalledWith(mockClientUser, mockDeliveryId);
      expect(mockHandoverService.clientRequestRevision).toHaveBeenCalledWith(mockDeliveryId, mockClientUser.actorId, 'Update colors');
    });

    it('denies revision request for another client in the same company', async () => {
      const req = { user: mockOtherClientUser };
      await expect(controller.clientRequestRevision(req, mockDeliveryId, { revisionNotes: 'Hack' })).rejects.toThrow(ForbiddenException);
      expect(mockHandoverService.clientRequestRevision).not.toHaveBeenCalled();
    });

    it('allows Chairman to accept delivery on project', async () => {
      const req = { user: mockChairmanUser };
      const res = await controller.clientAcceptDelivery(req, mockDeliveryId);
      expect(res).toEqual({ accepted: true });
      expect(mockAuthz.assertDeliveryClientAccess).toHaveBeenCalledWith(mockChairmanUser, mockDeliveryId);
      expect(mockHandoverService.clientAcceptHandover).toHaveBeenCalledWith(mockDeliveryId, mockChairmanUser.actorId);
    });

    it('enforces server-controlled canonical workspace on executeDevelopment and rejects traversal', async () => {
      const req = { user: mockChairmanUser };
      await expect(controller.executeDevelopment(req, mockProjectId, '../../traversal')).rejects.toThrow(BadRequestException);
      expect(mockToolRouter.executeGovernedGeneration).not.toHaveBeenCalled();
    });

    it('derives canonical workspace when workspaceDir is omitted in executeDevelopment', async () => {
      const req = { user: mockChairmanUser };
      const res = await controller.executeDevelopment(req, mockProjectId);
      expect(res).toEqual({ generatedFiles: 3 });
      expect(mockWorkspaceService.resolveAndVerifyCanonicalWorkspace).toHaveBeenCalledWith(mockCompanyId, mockProjectId, undefined);
      expect(mockToolRouter.executeGovernedGeneration).toHaveBeenCalledWith(
        mockProjectId,
        `/workspace/${mockCompanyId}/${mockProjectId}`,
        { target: 'CLAUDE_CODE' },
      );
    });

    it('enforces server-controlled canonical workspace on orchestrateBuild and rejects traversal', async () => {
      const req = { user: mockChairmanUser };
      await expect(controller.orchestrateBuild(req, mockProjectId, '../../traversal')).rejects.toThrow(BadRequestException);
      expect(mockBuildOrchestrator.orchestratePipeline).not.toHaveBeenCalled();
    });

    it('protects getProjectFactoryStatus with tenant resource check', async () => {
      const foreignReq = { user: mockForeignUser };
      await expect(controller.getProjectFactoryStatus(foreignReq, mockProjectId)).rejects.toThrow(NotFoundException);

      const authReq = { user: mockChairmanUser };
      const status = await controller.getProjectFactoryStatus(authReq, mockProjectId);
      expect(status.projectId).toBe(mockProjectId);
      expect(status.quotedPrice).toBe(1000000);
      expect(mockAuthz.assertResourceAccess).toHaveBeenCalledWith(mockChairmanUser, 'project', mockProjectId);
    });
  });
});
