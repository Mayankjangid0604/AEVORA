import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { WorkloadService } from '../workload/workload.service';
import { CompanyMetricsService } from '../company-operations/company-metrics.service';
import { KnowledgeRetrievalService } from '../knowledge/knowledge-retrieval.service';

@Injectable()
export class AgentContextBuilder {
  constructor(
    private prisma: PrismaService,
    private memory: MemoryService,
    private workload: WorkloadService,
    private metrics: CompanyMetricsService,
    private knowledge: KnowledgeRetrievalService
  ) {}

  async buildContext(agentId: string): Promise<{ systemInstructions: string, contextData: any }> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        employee: {
          include: {
            role: true,
            skills: true,
            goals: { where: { status: 'ACTIVE' } },
            assignedTasks: { where: { status: { in: ['READY', 'IN_PROGRESS', 'REVIEW', 'BACKLOG'] } }, include: { dependencies: true } }
          }
        }
      }
    });

    if (!agent || !agent.employee) throw new Error('Invalid agent identity');
    
    const emp = agent.employee;
    const config = agent.configuration as any;
    const memories = await this.memory.getRecentMemories(agent.id);
    const workloadData = await this.workload.calculateEmployeeWorkload(emp.id);

    const contextData: any = {
      identity: {
        name: emp.name,
        role: emp.role.title,
        departmentId: emp.departmentId,
        status: emp.status,
        activity: emp.activity
      },
      skills: emp.skills.map(s => ({ name: s.name, level: s.proficiency })),
      goals: emp.goals.map(g => ({ id: g.id, title: g.title, progress: g.progress })),
      tasks: emp.assignedTasks.map(t => ({ 
        id: t.id, 
        title: t.title, 
        status: t.status, 
        priority: t.priority,
        projectId: t.projectId,
        progress: t.progress,
        hasDependencies: t.dependencies.length > 0
      })),
      workload: workloadData,
      recentMemories: memories.map(m => m.content)
    };

    // Inject company knowledge context
    const knowledgeRecords = await this.knowledge.searchKnowledge(emp.companyId, {
      canonicalOnly: true,
      departmentId: emp.departmentId || undefined,
    });
    
    // Also get cross-cutting generic knowledge
    const genericKnowledge = await this.knowledge.searchKnowledge(emp.companyId, {
      canonicalOnly: true,
    });
    
    // Combine and deduplicate
    const allKnowledge = [...knowledgeRecords, ...genericKnowledge];
    const uniqueKnowledge = Array.from(new Map(allKnowledge.map(item => [item.id, item])).values());
    
    contextData.companyKnowledge = uniqueKnowledge.slice(0, 15).map(k => ({
      id: k.id,
      title: k.title,
      type: k.type,
      summary: k.summary || k.content.substring(0, 200),
      importance: k.importance,
    }));

    // Inject bounded project context for Project Manager role
    if (emp.role.title === 'Project Manager') {
      const activeProjects = await this.prisma.project.findMany({
        where: {
          companyId: emp.companyId,
          status: { in: ['PLANNED', 'ACTIVE'] }
        },
        include: {
          tasks: {
            where: { status: { in: ['READY', 'IN_PROGRESS', 'BACKLOG', 'REVIEW'] } },
            take: 20
          },
          requirements: { take: 10 },
          plans: { take: 3 },
          milestones: { take: 5 },
          assignments: {
            where: { status: 'ACTIVE' },
            include: { employee: { select: { id: true, name: true, availability: true } } }
          }
        }
      });

      contextData.managedProjects = activeProjects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        requirementsCount: p.requirements.length,
        openRequirements: p.requirements.filter(r => r.status === 'OPEN').length,
        activePlanExists: p.plans.some(pl => ['DRAFT', 'APPROVED'].includes(pl.status)),
        pendingTasks: p.tasks.length,
        milestones: p.milestones.map(m => ({ id: m.id, name: m.name, status: m.status })),
        team: p.assignments.map(a => ({ 
          employeeId: a.employeeId,
          name: a.employee?.name,
          role: a.role,
          availability: a.employee?.availability
        }))
      }));
    }

    // Inject management context for CEO or other general managers
    const managementRoles = ['CEO', 'HR Manager', 'Engineering Manager', 'Operations Manager', 'Sales Manager'];
    if (managementRoles.includes(emp.role.title)) {
      const metrics = await this.metrics.getCompanyMetrics(emp.companyId);
      const activeAlerts = await this.prisma.operationalAlert.findMany({
        where: { companyId: emp.companyId, status: 'ACTIVE' },
        take: 10
      });
      const pendingDecisions = await this.prisma.managementDecision.findMany({
        where: { companyId: emp.companyId, status: 'PROPOSED' },
        take: 10
      });
      const departmentSummaries = await this.prisma.department.findMany({
        where: { companyId: emp.companyId, status: 'ACTIVE' },
        select: { id: true, name: true, _count: { select: { employees: true } } }
      });

      const chairmanDirectives = await this.prisma.managementDecision.findMany({
        where: {
          companyId: emp.companyId,
          targetEmployeeId: emp.id,
          status: 'APPROVED',
          payload: { path: ['source'], equals: 'CHAIRMAN_VOICE' },
          createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      contextData.companyOperations = {
        metrics,
        activeAlerts: activeAlerts.map(a => ({ id: a.id, severity: a.severity, category: a.category, title: a.title })),
        pendingDecisions: pendingDecisions.map(d => ({ id: d.id, type: d.type, title: d.title })),
        departments: departmentSummaries.map(d => ({ id: d.id, name: d.name, employeeCount: d._count.employees })),
        chairmanDirectives: chairmanDirectives.map(d => ({ id: d.id, title: d.title, instruction: d.description, issuedAt: d.createdAt }))
      };
    }

    // Inject active intelligence session for this employee (Phase 12)
    const activeSession = await this.prisma.intelligenceSession.findFirst({
      where: { employeeId: emp.id, status: 'ACTIVE' },
      include: {
        plans: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }, include: { steps: true } },
        assessments: { orderBy: { createdAt: 'desc' }, take: 1 },
      }
    });

    if (activeSession) {
      contextData.activeIntelligenceSession = {
        id: activeSession.id,
        objective: activeSession.objective,
        taskId: activeSession.taskId,
        latestAssessment: activeSession.assessments[0] ? {
          summary: activeSession.assessments[0].summary,
          recommendation: activeSession.assessments[0].recommendation
        } : null,
        activePlan: activeSession.plans[0] ? {
          objective: activeSession.plans[0].objective,
          steps: activeSession.plans[0].steps.map(s => ({ title: s.title, status: s.status }))
        } : null
      };
    }

    return {
      systemInstructions: config.systemInstructions || 'You are an AI employee.',
      contextData
    };
  }
}
