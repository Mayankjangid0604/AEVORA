import { Test, TestingModule } from '@nestjs/testing';
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
import { FactoryResilienceIncidentService } from './factory-resilience-incident.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskService } from '../task/task.service';
import { IncidentManagerService } from '../reliability/incident-manager.service';
import {
  DevelopmentToolTarget,
  DeploymentEnvironment,
  DeploymentProviderType,
  QualityGateStatus,
  CleanupSafetyDecision,
  HandoverStatus,
} from './project-delivery.types';
import * as path from 'path';
import * as fs from 'fs';

describe('AEVORA V19 — Complete Development & Delivery Factory Specification', () => {
  let intakeService: ProjectIntakeService;
  let assessmentService: ScopeBudgetAssessmentService;
  let planningService: FactoryPlanningService;
  let toolRouter: GovernedToolRouterService;
  let workspaceService: FactoryWorkspaceService;
  let buildOrchestrator: FactoryBuildOrchestratorService;
  let qualityGateService: FactoryQualityGateService;
  let deploymentService: FactoryDeploymentService;
  let handoverService: FactoryDeliveryHandoverService;
  let cleanupService: FactorySafeCleanupService;
  let resilienceService: FactoryResilienceIncidentService;

  const mockCompanyId = 'comp-v19-test';
  const mockClientId = 'client-v19-test';
  const mockProjectId = 'proj-v19-test';
  const mockActorId = 'chairman-01';

  // In-memory data store mimicking Prisma models
  let memoryStore: {
    companies: any[];
    clients: any[];
    opportunities: any[];
    proposals: any[];
    projects: any[];
    requirements: any[];
    plans: any[];
    milestones: any[];
    risks: any[];
    tasks: any[];
    dependencies: any[];
    builds: any[];
    tests: any[];
    deliveries: any[];
    acceptances: any[];
    companyEvents: any[];
    killSwitches: any[];
    projectCosts: any[];
    employees: any[];
  };

  const testTempDir = path.join(process.cwd(), '.workspace', mockCompanyId, mockProjectId);
  const testArtifactDir = path.join(process.cwd(), '.artifacts', mockCompanyId, mockProjectId);

  beforeAll(() => {
    // Ensure clean test directories
    if (fs.existsSync(testTempDir)) fs.rmSync(testTempDir, { recursive: true, force: true });
    if (fs.existsSync(testArtifactDir)) fs.rmSync(testArtifactDir, { recursive: true, force: true });
  });

  afterAll(() => {
    // Cleanup test artifacts
    if (fs.existsSync(testTempDir)) fs.rmSync(testTempDir, { recursive: true, force: true });
    if (fs.existsSync(testArtifactDir)) fs.rmSync(testArtifactDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    memoryStore = {
      companies: [{ id: mockCompanyId, name: 'Aevora Test Corp', status: 'ACTIVE' }],
      clients: [{ id: mockClientId, companyId: mockCompanyId, name: 'Client Apex' }],
      opportunities: [],
      proposals: [],
      projects: [],
      requirements: [],
      plans: [],
      milestones: [],
      risks: [],
      tasks: [],
      dependencies: [],
      builds: [],
      tests: [],
      deliveries: [],
      acceptances: [],
      companyEvents: [],
      killSwitches: [],
      projectCosts: [],
      employees: [{ id: mockActorId, companyId: mockCompanyId, name: 'Chairman Mayank', role: { id: 'r1', departmentId: 'exec' } }],
    };

    const mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(({ where }) => memoryStore.companies.find(c => c.id === where.id) || null),
      },
      client: {
        findUnique: jest.fn().mockImplementation(({ where }) => memoryStore.clients.find(c => c.id === where.id) || null),
      },
      opportunity: {
        create: jest.fn().mockImplementation(({ data }) => {
          const opp = { id: `opp-${Date.now()}`, ...data };
          memoryStore.opportunities.push(opp);
          return opp;
        }),
      },
      proposal: {
        create: jest.fn().mockImplementation(({ data }) => {
          const p = { id: `prop-${Date.now()}`, ...data };
          memoryStore.proposals.push(p);
          return p;
        }),
      },
      project: {
        create: jest.fn().mockImplementation(({ data }) => {
          const proj = {
            id: mockProjectId,
            quotedPrice: 1000000,
            estimatedCost: 600000,
            margin: 40,
            status: 'PLANNED',
            ...data,
          };
          memoryStore.projects.push(proj);
          return proj;
        }),
        findUnique: jest.fn().mockImplementation(({ where, include }) => {
          const p = memoryStore.projects.find(x => x.id === where.id);
          if (!p) return null;
          const copy = { ...p };
          if (include?.requirements) {
            copy.requirements = memoryStore.requirements.filter(r => r.projectId === p.id);
          }
          if (include?.company) {
            copy.company = memoryStore.companies.find(c => c.id === p.companyId);
          }
          if (include?.client) {
            copy.client = memoryStore.clients.find(c => c.id === p.clientId);
          }
          if (include?.acceptances) {
            copy.acceptances = memoryStore.acceptances.filter(a => a.projectId === p.id);
          }
          return copy;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const p = memoryStore.projects.find(x => x.id === where.id);
          if (p) Object.assign(p, data);
          return p;
        }),
      },
      projectRequirement: {
        create: jest.fn().mockImplementation(({ data }) => {
          const req = { id: `req-${memoryStore.requirements.length + 1}`, ...data };
          memoryStore.requirements.push(req);
          return req;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => memoryStore.requirements.filter(r => r.projectId === where.projectId)),
      },
      projectPlan: {
        create: jest.fn().mockImplementation(({ data }) => {
          const pl = { id: `plan-${Date.now()}`, ...data };
          memoryStore.plans.push(pl);
          return pl;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => memoryStore.plans.find(pl => pl.projectId === where.projectId) || null),
      },
      projectMilestone: {
        create: jest.fn().mockImplementation(({ data }) => {
          const m = { id: `m-${Date.now()}-${data.sequence}`, ...data };
          memoryStore.milestones.push(m);
          return m;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => memoryStore.milestones.find(m => m.projectId === where.projectId && m.sequence === where.sequence) || null),
      },
      projectRisk: {
        create: jest.fn().mockImplementation(({ data }) => {
          const r = { id: `risk-${Date.now()}`, ...data };
          memoryStore.risks.push(r);
          return r;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => memoryStore.risks.find(r => r.projectId === where.projectId && r.title === where.title) || null),
      },
      task: {
        update: jest.fn().mockImplementation(({ where, data }) => {
          const t = memoryStore.tasks.find(x => x.id === where.id);
          if (t) Object.assign(t, data);
          return t;
        }),
      },
      projectBuildExecution: {
        create: jest.fn().mockImplementation(({ data }) => {
          const b = { id: `build-${Date.now()}`, ...data };
          memoryStore.builds.push(b);
          return b;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const b = memoryStore.builds.find(x => x.id === where.id);
          if (b) Object.assign(b, data);
          return b;
        }),
      },
      projectTestExecution: {
        create: jest.fn().mockImplementation(({ data }) => {
          const t = { id: `test-${Date.now()}`, ...data };
          memoryStore.tests.push(t);
          return t;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const t = memoryStore.tests.find(x => x.id === where.id);
          if (t) Object.assign(t, data);
          return t;
        }),
      },
      projectDelivery: {
        create: jest.fn().mockImplementation(({ data }) => {
          const d = { id: `deliv-${Date.now()}`, ...data };
          memoryStore.deliveries.push(d);
          return d;
        }),
        findUnique: jest.fn().mockImplementation(({ where, include }) => {
          const d = memoryStore.deliveries.find(x => x.id === where.id);
          if (!d) return null;
          const copy = { ...d };
          if (include?.project) {
            copy.project = memoryStore.projects.find(p => p.id === d.projectId);
          }
          return copy;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const d = memoryStore.deliveries.find(x => x.id === where.id);
          if (d) Object.assign(d, data);
          return d;
        }),
      },
      customerAcceptance: {
        create: jest.fn().mockImplementation(({ data }) => {
          const a = { id: `acc-${Date.now()}`, ...data };
          memoryStore.acceptances.push(a);
          return a;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.acceptances.find(a => {
            let match = true;
            if (where.deliveryId) match = match && a.deliveryId === where.deliveryId;
            if (where.status) match = match && a.status === where.status;
            return match;
          }) || null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const a = memoryStore.acceptances.find(x => x.id === where.id);
          if (a) Object.assign(a, data);
          return a;
        }),
      },
      companyEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const ev = { id: `ev-${Date.now()}`, ...data };
          memoryStore.companyEvents.push(ev);
          return ev;
        }),
      },
      killSwitchConfig: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.killSwitches.find(k => k.companyId === where.companyId && k.feature === where.feature) || null;
        }),
      },
      employee: {
        findUnique: jest.fn().mockImplementation(({ where }) => memoryStore.employees.find(e => e.id === where.id) || null),
      },
      projectCost: {
        create: jest.fn().mockImplementation(({ data }) => {
          const projectId = data.project?.connect?.id || data.projectId;
          const companyId = data.company?.connect?.id || data.companyId;
          const c = { id: `cost-${Date.now()}`, projectId, companyId, ...data };
          memoryStore.projectCosts.push(c);
          return c;
        }),
      },
    };

    const mockTaskService = {
      createTask: jest.fn().mockImplementation((dto) => {
        const t = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...dto, status: 'OPEN' };
        memoryStore.tasks.push(t);
        return t;
      }),
    };

    const mockIncidentManager = {
      triageIncident: jest.fn().mockImplementation((companyId, payload) => ({
        incident: { id: `inc-${Date.now()}`, companyId, ...payload },
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectIntakeService,
        ScopeBudgetAssessmentService,
        FactoryPlanningService,
        GovernedToolRouterService,
        FactoryWorkspaceService,
        FactoryBuildOrchestratorService,
        FactoryQualityGateService,
        FactoryDeploymentService,
        FactoryDeliveryHandoverService,
        FactorySafeCleanupService,
        FactoryResilienceIncidentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TaskService, useValue: mockTaskService },
        { provide: IncidentManagerService, useValue: mockIncidentManager },
      ],
    }).compile();

    intakeService = module.get<ProjectIntakeService>(ProjectIntakeService);
    assessmentService = module.get<ScopeBudgetAssessmentService>(ScopeBudgetAssessmentService);
    planningService = module.get<FactoryPlanningService>(FactoryPlanningService);
    toolRouter = module.get<GovernedToolRouterService>(GovernedToolRouterService);
    workspaceService = module.get<FactoryWorkspaceService>(FactoryWorkspaceService);
    buildOrchestrator = module.get<FactoryBuildOrchestratorService>(FactoryBuildOrchestratorService);
    qualityGateService = module.get<FactoryQualityGateService>(FactoryQualityGateService);
    deploymentService = module.get<FactoryDeploymentService>(FactoryDeploymentService);
    handoverService = module.get<FactoryDeliveryHandoverService>(FactoryDeliveryHandoverService);
    cleanupService = module.get<FactorySafeCleanupService>(FactorySafeCleanupService);
    resilienceService = module.get<FactoryResilienceIncidentService>(FactoryResilienceIncidentService);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Project Intake & Requirements Decomposition
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Project Intake & Requirements Analysis', () => {
    it('successfully processes intake, creates project and decomposes structured requirements', async () => {
      const result = await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Client Portal Website',
        description: 'Responsive customer portal. Must include secure auth. External CRM integration. High performance.',
        rawRequirements: [
          'User authentication and role-based permissions',
          'Responsive client dashboard with billing overview',
          'Integration with external CRM via webhook',
        ],
        budgetPaise: 800000,
        projectType: 'WEBSITE',
      });

      expect(result.project).toBeDefined();
      expect(result.project.name).toBe('Client Portal Website');
      expect(result.project.status).toBe('PLANNED');
      expect(result.requirements.length).toBe(3);

      const authReq = result.requirements.find(r => r.description.includes('authentication'));
      expect(authReq.priority).toBe('URGENT');
      expect(authReq.acceptanceCriteria).toBeDefined();
    });

    it('rejects intake when client does not belong to the target company', async () => {
      await expect(
        intakeService.processIntake({
          companyId: mockCompanyId,
          clientId: 'alien-client',
          name: 'Breach Project',
          description: 'Invalid client boundary',
        }),
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Scope, Budget, Complexity & Risk Assessment
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Scope, Budget, Complexity & Risk Assessment', () => {
    it('assesses project complexity, estimated cost, margin and generates quantified risks', async () => {
      // Seed project and requirements
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Enterprise Analytics Suite',
        description: 'Comprehensive business intelligence platform with high security and API integration.',
        rawRequirements: [
          'Enterprise single sign-on security',
          'Real-time streaming pipeline integration',
          'Executive reporting dashboards',
        ],
        budgetPaise: 1500000,
      });

      const assessment = await assessmentService.assessProjectScopeAndBudget(mockProjectId);

      expect(assessment.complexity).toBeDefined();
      expect(assessment.estimatedEffortHours).toBeGreaterThan(0);
      expect(assessment.estimatedCostPaise).toBeGreaterThan(0);
      expect(assessment.projectedMarginPercent).toBeGreaterThanOrEqual(35);
      expect(assessment.risksIdentified.length).toBeGreaterThanOrEqual(1);

      // Verify deterministic severity calculation: floor((prob * impact) / 100)
      for (const risk of assessment.risksIdentified) {
        expect(risk.severity).toBe(Math.floor((risk.probability * risk.impact) / 100));
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Project Planning, Milestones & Task Decomposition
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Project Planning & Task Orchestration', () => {
    it('creates decomposed plan with 4 factory milestones and chained prerequisite tasks', async () => {
      // Seed project
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'SaaS Platform',
        description: 'Multi-tenant SaaS application.',
      });

      const planResult = await planningService.createDecomposedPlan(mockProjectId, mockActorId);

      expect(planResult.plan).toBeDefined();
      expect(planResult.milestones.length).toBe(4);
      expect(planResult.tasks.length).toBe(4);

      // Verify milestones sequence
      expect(planResult.milestones[0].name).toContain('M1: Architecture');
      expect(planResult.milestones[3].name).toContain('M4: Deployment');

      // Verify project transitions to ACTIVE
      const project = memoryStore.projects.find(p => p.id === mockProjectId);
      expect(project.status).toBe('ACTIVE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Governed Development-Tool Selection & Routing Policy
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Governed Tool Selection & Orchestration', () => {
    it('routes low/medium budget website projects to Antigravity routing policy', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Boutique Website',
        description: 'Simple static portfolio website.',
        budgetPaise: 500000,
        projectType: 'WEBSITE',
      });

      const decision = await toolRouter.determineToolRouting(mockProjectId);
      expect(decision.tool).toBe(DevelopmentToolTarget.ANTIGRAVITY);
      expect(decision.timeoutMs).toBe(300000);
      expect(decision.maxRetries).toBe(3);
    });

    it('routes complex enterprise projects to Claude Code routing policy', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'High-Value Enterprise Core',
        description: 'Complex enterprise backend with extensive data pipelines.',
        rawRequirements: ['Req 1', 'Req 2', 'Req 3', 'Req 4', 'Req 5', 'Req 6', 'Req 7'],
        budgetPaise: 2500000,
      });

      const decision = await toolRouter.determineToolRouting(mockProjectId);
      expect(decision.tool).toBe(DevelopmentToolTarget.CLAUDE_CODE);
      expect(decision.requiresOperatorReview).toBe(true);
    });

    it('blocks execution when company tool execution kill-switch is active', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Killed Project',
        description: 'Project under kill switch.',
      });

      memoryStore.killSwitches.push({
        companyId: mockCompanyId,
        feature: 'DEVELOPMENT_TOOL_EXECUTION',
        isDisabled: true,
      });

      await expect(toolRouter.determineToolRouting(mockProjectId)).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Workspace Isolation & Lifecycle Management
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Workspace Isolation & Optional Local Git', () => {
    it('allocates canonical isolated workspace and handles optional local Git without remotes', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Sandbox Project',
        description: 'Testing isolated workspace allocation.',
      });

      const ws = await workspaceService.allocateWorkspace(mockCompanyId, mockProjectId);

      expect(ws.localPath).toContain(path.join('.workspace', mockCompanyId, mockProjectId));
      expect(fs.existsSync(ws.localPath)).toBe(true);
      expect(ws.hasLocalGit).toBeDefined(); // true or false depending on host git CLI
    });

    it('prevents directory traversal outside sandbox base in resolveAndVerifyCanonicalWorkspace', () => {
      expect(() => workspaceService.resolveAndVerifyCanonicalWorkspace(mockCompanyId, '../escaped')).toThrow();
      expect(() => workspaceService.resolveAndVerifyCanonicalWorkspace('../../etc', mockProjectId)).toThrow();
    });

    it('validates candidate workspace path against canonical path', () => {
      const canonical = workspaceService.resolveAndVerifyCanonicalWorkspace(mockCompanyId, mockProjectId);
      expect(canonical).toBe(path.resolve(process.cwd(), '.workspace', mockCompanyId, mockProjectId));

      // Candidate matching canonical succeeds
      expect(workspaceService.resolveAndVerifyCanonicalWorkspace(mockCompanyId, mockProjectId, canonical)).toBe(canonical);

      // Hostile candidate path fails
      expect(() =>
        workspaceService.resolveAndVerifyCanonicalWorkspace(mockCompanyId, mockProjectId, path.resolve(process.cwd(), 'outside')),
      ).toThrow();
    });

    it('governed tool router and build orchestrator reject paths escaping sandbox', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Sandbox Escape Test App',
        description: 'Testing path escape rejection.',
        projectType: 'WEBSITE',
      });
      const decision = await toolRouter.determineToolRouting(mockProjectId);
      const outsidePath = path.resolve(process.cwd(), 'outside-sandbox-dir');

      await expect(
        toolRouter.executeGovernedGeneration(mockProjectId, outsidePath, decision),
      ).rejects.toThrow();

      await expect(
        buildOrchestrator.orchestratePipeline(mockProjectId, outsidePath),
      ).rejects.toThrow();
    });

    it('hardens preserveArtifacts against external sources, traversal, cross-project access, symlink escape, and overwrite', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Artifact Hardening Project',
        description: 'Testing artifact source-path security.',
      });

      const ws = await workspaceService.allocateWorkspace(mockCompanyId, mockProjectId);
      const subDir = path.join(ws.localPath, 'dist');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'bundle.js'), 'console.log("hello");');

      // 1. Valid source inside canonical workspace succeeds
      const preservedPath = await workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, subDir);
      expect(preservedPath).toBeDefined();
      expect(fs.existsSync(preservedPath)).toBe(true);

      // 2. Reject silent overwrite when destination artifact already exists
      await expect(
        workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, subDir),
      ).rejects.toThrow('already exists at destination');

      // 3. Source outside .workspace is rejected
      const outsideFile = path.resolve(process.cwd(), 'package.json');
      await expect(
        workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, outsideFile),
      ).rejects.toThrow('outside authorized project workspace');

      // 4. Traversal attempt escaping project workspace is rejected
      const traversalPath = path.join(ws.localPath, '../../outside.txt');
      await expect(
        workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, traversalPath),
      ).rejects.toThrow('outside authorized project workspace');

      // 5. Source inside another project's workspace is rejected
      const otherProjectWs = path.resolve(process.cwd(), '.workspace', mockCompanyId, 'other-proj');
      fs.mkdirSync(otherProjectWs, { recursive: true });
      const otherFile = path.join(otherProjectWs, 'other.txt');
      fs.writeFileSync(otherFile, 'other content');
      try {
        await expect(
          workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, otherFile),
        ).rejects.toThrow('outside authorized project workspace');
      } finally {
        if (fs.existsSync(otherProjectWs)) fs.rmSync(otherProjectWs, { recursive: true, force: true });
      }

      // 6. Symlink or junction escape to outside directory is rejected
      const externalTestDir = path.resolve(process.cwd(), 'tmp-external-escape-test');
      fs.mkdirSync(externalTestDir, { recursive: true });
      fs.writeFileSync(path.join(externalTestDir, 'leak.txt'), 'leaked');

      const junctionLink = path.join(ws.localPath, 'symlink-escape');
      try {
        fs.symlinkSync(externalTestDir, junctionLink, process.platform === 'win32' ? 'junction' : 'dir');
        await expect(
          workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, junctionLink),
        ).rejects.toThrow('escapes sandbox boundary via symlink or reparse point');
      } finally {
        if (fs.existsSync(junctionLink)) {
          try {
            fs.unlinkSync(junctionLink);
          } catch {
            fs.rmdirSync(junctionLink);
          }
        }
        if (fs.existsSync(externalTestDir)) fs.rmSync(externalTestDir, { recursive: true, force: true });
      }

      // 7. Project ownership mismatch is rejected
      await expect(
        workspaceService.preserveArtifacts('alien-company', mockProjectId, subDir),
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Build, Test & Security Verification Orchestration
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Build, Test & Security Orchestration', () => {
    it('generates governed code, builds artifact, runs tests and verifies zero leaked secrets', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Web Application',
        description: 'Test application for build verification.',
        projectType: 'WEBSITE',
      });

      const decision = await toolRouter.determineToolRouting(mockProjectId);
      const ws = await workspaceService.allocateWorkspace(mockCompanyId, mockProjectId);

      // Generate governed baseline files
      const genResult = await toolRouter.executeGovernedGeneration(mockProjectId, ws.localPath, decision);
      expect(genResult.success).toBe(true);
      expect(genResult.filesGenerated.length).toBeGreaterThan(0);

      // Orchestrate build, test, and security scan
      const summary = await buildOrchestrator.orchestratePipeline(mockProjectId, ws.localPath);

      expect(summary.buildStatus).toBe('PASSED');
      expect(summary.testStatus).toBe('PASSED');
      expect(summary.securityScanStatus).toBe('PASSED');
      expect(summary.secretsDetected).toBe(0);
      expect(summary.artifactHash).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Multi-Stage Quality Gate Evaluation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Quality Gate & Evidence-Based Acceptance', () => {
    it('evaluates quality gate with passing score and immutable cryptographic hash', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Quality Checked App',
        description: 'Application undergoing full quality gate check.',
        projectType: 'WEBSITE',
      });

      const ws = await workspaceService.allocateWorkspace(mockCompanyId, mockProjectId);
      const decision = await toolRouter.determineToolRouting(mockProjectId);
      await toolRouter.executeGovernedGeneration(mockProjectId, ws.localPath, decision);
      const summary = await buildOrchestrator.orchestratePipeline(mockProjectId, ws.localPath);

      const gate = await qualityGateService.evaluateQualityGate(mockProjectId, summary);

      expect(gate.overallStatus).toBe(QualityGateStatus.PASSED);
      expect(gate.score).toBe(100);
      expect(gate.evidenceHash).toBeDefined();
      expect(gate.blockers.length).toBe(0);
      expect(gate.checks.buildVerification.passed).toBe(true);
      expect(gate.checks.testVerification.passed).toBe(true);
      expect(gate.checks.securityVerification.passed).toBe(true);
    });

    it('rejects quality gate if security scan detects leaked credentials', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Insecure App',
        description: 'Simulating secret leak.',
      });

      const failedSummary: any = {
        buildId: 'b-fake',
        artifactPath: 'some/path',
        artifactHash: 'hash123',
        dependencyStatus: 'PASSED',
        buildStatus: 'PASSED',
        lintStatus: 'PASSED',
        typeCheckStatus: 'PASSED',
        testStatus: 'PASSED',
        securityScanStatus: 'FAILED',
        secretsDetected: 2,
        logs: [],
      };

      const gate = await qualityGateService.evaluateQualityGate(mockProjectId, failedSummary);
      expect(gate.overallStatus).toBe(QualityGateStatus.FAILED);
      expect(gate.score).toBeLessThan(100);
      expect(gate.blockers).toContain('Security violation: 2 leaked secrets detected');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Deployment Lifecycle, Health Verification & Rollback Plan
  // ─────────────────────────────────────────────────────────────────────────────
  describe('8. Deployment Lifecycle & Rollback Planning', () => {
    it('deploys to PREVIEW environment using Vercel Mock adapter with health check', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Preview Deployment App',
        description: 'Preview testing.',
      });

      const deployment = await deploymentService.deployProject({
        projectId: mockProjectId,
        environment: DeploymentEnvironment.PREVIEW,
        provider: DeploymentProviderType.VERCEL_MOCK,
        actorId: mockActorId,
        qualityGateStatus: QualityGateStatus.PASSED,
      });

      expect(deployment.environment).toBe(DeploymentEnvironment.PREVIEW);
      expect(deployment.deploymentUrl).toContain('vercel.app');
      expect(deployment.healthStatus).toBe('HEALTHY');
      expect(deployment.rollbackPlan.rollbackProcedure.length).toBeGreaterThan(0);
    });

    it('refuses deployment if Quality Gate has not PASSED', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Unqualified Deploy',
        description: 'Should fail deployment.',
      });

      await expect(
        deploymentService.deployProject({
          projectId: mockProjectId,
          environment: DeploymentEnvironment.PRODUCTION,
          actorId: mockActorId,
          qualityGateStatus: QualityGateStatus.FAILED,
        }),
      ).rejects.toThrow(/Must be PASSED before deployment/);
    });

    it('requires verified authorization for PRODUCTION deployment', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Unauthenticated Prod Deploy',
        description: 'Unauthorized actor test.',
      });

      await expect(
        deploymentService.deployProject({
          projectId: mockProjectId,
          environment: DeploymentEnvironment.PRODUCTION,
          actorId: 'unauthorized-intruder',
          qualityGateStatus: QualityGateStatus.PASSED,
        }),
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Client Delivery & Authorized Ownership Handover
  // ─────────────────────────────────────────────────────────────────────────────
  describe('9. Client Delivery & Ownership Handover', () => {
    it('packages formal delivery, handles client acceptance, and transfers ownership', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Delivered Product',
        description: 'Ready for handover.',
      });

      const fakeGate: any = {
        buildId: 'b-delivered',
        overallStatus: QualityGateStatus.PASSED,
        score: 100,
        evidenceHash: 'sha256-verified-evidence',
      };

      // 1. Prepare Delivery Package
      const pkg = await handoverService.prepareDeliveryPackage({
        projectId: mockProjectId,
        requestedById: mockActorId,
        workspacePath: testTempDir,
        artifactPath: path.join(testTempDir, 'dist.bin'),
        qualityGate: fakeGate,
      });

      expect(pkg.status).toBe(HandoverStatus.PREPARED);
      expect(pkg.packageSummary).toContain('Delivered Product');

      const projectDelivered = memoryStore.projects.find(p => p.id === mockProjectId);
      expect(projectDelivered.status).toBe('DELIVERED');

      // 2. Client Reviews and Formally Accepts
      const acceptResult = await handoverService.clientAcceptHandover(pkg.id, mockClientId);
      expect(acceptResult.status).toBe(HandoverStatus.TRANSFERRED);

      const projectCompleted = memoryStore.projects.find(p => p.id === mockProjectId);
      expect(projectCompleted.status).toBe('COMPLETED');
    });

    it('reverts project to ACTIVE when client requests revisions', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Revision Product',
        description: 'Client requests changes.',
      });

      const fakeGate: any = {
        buildId: 'b-rev',
        overallStatus: QualityGateStatus.PASSED,
        score: 100,
        evidenceHash: 'evidence-hash',
      };

      const pkg = await handoverService.prepareDeliveryPackage({
        projectId: mockProjectId,
        requestedById: mockActorId,
        workspacePath: testTempDir,
        artifactPath: path.join(testTempDir, 'dist.bin'),
        qualityGate: fakeGate,
      });

      const revResult = await handoverService.clientRequestRevision(pkg.id, mockClientId, 'Update hero title');
      expect(revResult.status).toBe(HandoverStatus.REJECTED);

      const projectActive = memoryStore.projects.find(p => p.id === mockProjectId);
      expect(projectActive.status).toBe('ACTIVE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Safe Workspace Cleanup & Artifact Retention
  // ─────────────────────────────────────────────────────────────────────────────
  describe('10. Safe Workspace Cleanup & Retention Verification', () => {
    it('rejects cleanup if project is not COMPLETED or artifacts are not preserved', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Incomplete Cleanup Project',
        description: 'Should reject premature cleanup.',
      });

      // Project is still PLANNED
      const evalResult = await cleanupService.evaluateCleanupEligibility(
        mockCompanyId,
        mockProjectId,
        testTempDir,
      );

      expect(evalResult.decision).toBe(CleanupSafetyDecision.INELIGIBLE);
      expect(evalResult.blockers.some(b => b.includes('COMPLETED or CANCELLED'))).toBe(true);
    });

    it('approves cleanup when 7-point safety criteria are met, executes dry-run and safe deletion', async () => {
      // 1. Setup completed project with accepted delivery
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Cleanable Completed Project',
        description: 'Safe cleanup testing.',
        projectType: 'WEBSITE',
      });

      // Create dummy workspace files
      const ws = await workspaceService.allocateWorkspace(mockCompanyId, mockProjectId);
      fs.writeFileSync(path.join(ws.localPath, 'index.html'), '<h1>Done</h1>');

      // Preserve artifacts into .artifacts/
      await workspaceService.preserveArtifacts(mockCompanyId, mockProjectId, ws.localPath);

      // Mark Project COMPLETED and record ACCEPTED customer acceptance
      const proj = memoryStore.projects.find(p => p.id === mockProjectId);
      proj.status = 'COMPLETED';
      proj.completedAt = new Date();

      memoryStore.acceptances.push({
        id: 'acc-clean',
        projectId: mockProjectId,
        companyId: mockCompanyId,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      });

      // 2. Evaluate Eligibility
      const evalResult = await cleanupService.evaluateCleanupEligibility(
        mockCompanyId,
        mockProjectId,
        ws.localPath,
      );

      expect(evalResult.decision).toBe(CleanupSafetyDecision.ELIGIBLE);
      expect(evalResult.blockers.length).toBe(0);

      // 3. Dry-Run Execution (does NOT delete disk)
      const dryRunResult = await cleanupService.executeSafeCleanup({
        companyId: mockCompanyId,
        projectId: mockProjectId,
        workspacePath: ws.localPath,
        dryRun: true,
        actorId: mockActorId,
      });
      expect(dryRunResult.dryRun).toBe(true);
      expect(dryRunResult.deleted).toBe(false);
      expect(fs.existsSync(ws.localPath)).toBe(true);

      // 4. Real Safe Deletion
      const realResult = await cleanupService.executeSafeCleanup({
        companyId: mockCompanyId,
        projectId: mockProjectId,
        workspacePath: ws.localPath,
        dryRun: false,
        actorId: mockActorId,
      });
      expect(realResult.dryRun).toBe(false);
      expect(realResult.deleted).toBe(true);
      expect(fs.existsSync(ws.localPath)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Resilience & Incident Escalation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('11. Resilience & Incident Escalation', () => {
    it('escalates build or quality gate failures into the V18 Incident Management system', async () => {
      await intakeService.processIntake({
        companyId: mockCompanyId,
        clientId: mockClientId,
        name: 'Failure Prone Project',
        description: 'Simulating execution breakdown.',
      });

      const escalation = await resilienceService.escalateFactoryFailure({
        companyId: mockCompanyId,
        projectId: mockProjectId,
        stage: 'BUILD',
        errorMessage: 'SyntaxError: Unexpected token in generated code',
      });

      expect(escalation).toBeDefined();

      const proj = memoryStore.projects.find(p => p.id === mockProjectId);
      expect(proj.status).toBe('BLOCKED');

      const cost = memoryStore.projectCosts.find(c => c.projectId === mockProjectId);
      expect(cost.category).toBe('FAILURE_OVERHEAD');
    });
  });
});
