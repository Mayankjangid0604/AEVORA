import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EnterpriseRelationshipGraph,
  GraphNode,
  GraphEdge,
} from './enterprise-brain.types';

@Injectable()
export class RelationshipGraphBuilder {
  private readonly logger = new Logger(RelationshipGraphBuilder.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministically constructs the complete company-isolated relationship graph.
   * Reads exclusively from authoritative PostgreSQL records.
   */
  async buildGraph(companyId: string): Promise<EnterpriseRelationshipGraph> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    const addNode = (node: GraphNode) => {
      if (!nodeIds.has(node.id)) {
        nodeIds.add(node.id);
        nodes.push(node);
      }
    };

    const addEdge = (edge: GraphEdge) => {
      // Only add edge if both endpoints exist to maintain graph integrity
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
        edges.push(edge);
      }
    };

    // 1. Fetch Customers, Leads, Opportunities, Campaigns, Projects, Revenue Records
    const [clients, leads, opportunities, campaigns, projects, revenueRecords] = await Promise.all([
      this.prisma.client.findMany({ where: { companyId }, take: 100 }),
      this.prisma.salesLead.findMany({ where: { companyId }, take: 100 }),
      this.prisma.opportunity.findMany({ where: { companyId }, take: 100 }),
      this.prisma.marketingCampaign.findMany({ where: { companyId }, take: 50 }),
      this.prisma.project.findMany({ where: { companyId }, take: 100 }),
      this.prisma.revenueRecord.findMany({ where: { companyId }, take: 100 }),
    ]);

    // 2. Fetch Departments, Employees, Goals/Objectives, Tasks
    const [departments, employees, goals, tasks] = await Promise.all([
      this.prisma.department.findMany({ where: { companyId }, take: 50 }),
      this.prisma.employee.findMany({ where: { companyId, status: 'ACTIVE' }, take: 150 }),
      this.prisma.goal.findMany({ where: { companyId }, take: 50 }),
      this.prisma.task.findMany({ where: { companyId }, include: { dependencies: true }, take: 200 }),
    ]);

    // Add Nodes: Customer to Revenue Chain
    for (const c of clients) {
      addNode({
        id: c.id,
        type: 'CUSTOMER',
        label: c.name,
        companyId,
        metadata: { status: c.status, organizationName: c.organizationName },
        createdAt: c.createdAt,
      });
    }

    for (const l of leads) {
      addNode({
        id: l.id,
        type: 'LEAD',
        label: l.name,
        companyId,
        metadata: { status: l.status, placeId: l.googlePlaceId },
        createdAt: l.createdAt,
      });
      // Link: Lead -> Converted Client
      if (l.convertedClientId && nodeIds.has(l.convertedClientId)) {
        addEdge({
          id: `edge-${l.id}-${l.convertedClientId}`,
          from: l.id,
          to: l.convertedClientId,
          type: 'CONVERTS_TO',
          companyId,
          metadata: { context: 'Lead converted to Client' },
        });
      }
      // Link: Lead -> Converted Opportunity
      if (l.convertedOpportunityId && nodeIds.has(l.convertedOpportunityId)) {
        addEdge({
          id: `edge-${l.id}-${l.convertedOpportunityId}`,
          from: l.id,
          to: l.convertedOpportunityId,
          type: 'CONVERTS_TO',
          companyId,
          metadata: { context: 'Lead converted to Opportunity' },
        });
      }
    }

    for (const opp of opportunities) {
      addNode({
        id: opp.id,
        type: 'OPPORTUNITY',
        label: opp.title,
        companyId,
        metadata: { status: opp.status, value: opp.estimatedValue },
        createdAt: opp.createdAt,
      });
      // Link: Client -> Opportunity
      if (opp.clientId && nodeIds.has(opp.clientId)) {
        addEdge({
          id: `edge-${opp.clientId}-${opp.id}`,
          from: opp.clientId,
          to: opp.id,
          type: 'CONVERTS_TO',
          companyId,
          metadata: { context: 'Client Opportunity' },
        });
      }
    }

    for (const cmp of campaigns) {
      addNode({
        id: cmp.id,
        type: 'CAMPAIGN',
        label: cmp.name,
        companyId,
        metadata: { status: cmp.status, budgetRecommendation: cmp.budgetRecommendation },
        createdAt: cmp.createdAt,
      });
    }

    // Projects link to Client and Opportunity
    for (const p of projects) {
      addNode({
        id: p.id,
        type: 'PROJECT',
        label: p.name,
        companyId,
        metadata: { status: p.status, quotedPrice: p.quotedPrice },
        createdAt: p.createdAt,
      });
      if (p.clientId && nodeIds.has(p.clientId)) {
        addEdge({
          id: `edge-${p.clientId}-${p.id}`,
          from: p.clientId,
          to: p.id,
          type: 'CONVERTS_TO',
          companyId,
          metadata: { context: 'Client contracted Project' },
        });
      }
      if (p.opportunityId && nodeIds.has(p.opportunityId)) {
        addEdge({
          id: `edge-${p.opportunityId}-${p.id}`,
          from: p.opportunityId,
          to: p.id,
          type: 'CONVERTS_TO',
          companyId,
          metadata: { context: 'Opportunity realized into Project' },
        });
      }
    }

    for (const rev of revenueRecords) {
      addNode({
        id: rev.id,
        type: 'REVENUE',
        label: `Revenue ₹${rev.amount}`,
        companyId,
        metadata: { amount: rev.amount, source: rev.source, receivedAt: rev.receivedAt },
        createdAt: rev.receivedAt ?? rev.createdAt,
      });
      if (rev.projectId && nodeIds.has(rev.projectId)) {
        addEdge({
          id: `edge-${rev.projectId}-${rev.id}`,
          from: rev.projectId,
          to: rev.id,
          type: 'GENERATES_REVENUE',
          companyId,
          metadata: { amount: rev.amount },
        });
      }
    }

    // Add Nodes: Employee to Outcome Chain
    for (const d of departments) {
      addNode({
        id: d.id,
        type: 'DEPARTMENT',
        label: d.name,
        companyId,
        metadata: { status: d.status },
        createdAt: d.createdAt,
      });
    }

    for (const emp of employees) {
      addNode({
        id: emp.id,
        type: 'EMPLOYEE',
        label: emp.name,
        companyId,
        metadata: { status: emp.status, hireDate: emp.hireDate },
        createdAt: emp.hireDate,
      });
      if (emp.departmentId && nodeIds.has(emp.departmentId)) {
        addEdge({
          id: `edge-${emp.id}-${emp.departmentId}`,
          from: emp.id,
          to: emp.departmentId,
          type: 'BELONGS_TO',
          companyId,
          metadata: {},
        });
      }
    }

    for (const g of goals) {
      addNode({
        id: g.id,
        type: 'OBJECTIVE',
        label: g.title,
        companyId,
        metadata: { status: g.status, progress: g.progress, priority: g.priority },
        createdAt: g.createdAt,
      });
    }

    for (const t of tasks) {
      addNode({
        id: t.id,
        type: 'TASK',
        label: t.title,
        companyId,
        metadata: { status: t.status, priority: t.priority, dueAt: t.dueAt },
        createdAt: t.createdAt,
      });

      if (t.assignedEmployeeId && nodeIds.has(t.assignedEmployeeId)) {
        addEdge({
          id: `edge-${t.assignedEmployeeId}-${t.id}`,
          from: t.assignedEmployeeId,
          to: t.id,
          type: 'EXECUTES_TASK',
          companyId,
          metadata: {},
        });
      }

      if (t.projectId && nodeIds.has(t.projectId)) {
        addEdge({
          id: `edge-${t.id}-${t.projectId}`,
          from: t.id,
          to: t.projectId,
          type: 'DELIVERS_OUTCOME',
          companyId,
          metadata: {},
        });
      }

      if (t.goalId && nodeIds.has(t.goalId)) {
        addEdge({
          id: `edge-${t.id}-${t.goalId}`,
          from: t.id,
          to: t.goalId,
          type: 'SERVES_OBJECTIVE',
          companyId,
          metadata: {},
        });
      }

      // Dependencies
      for (const dep of t.dependencies) {
        if (nodeIds.has(dep.dependsOnId)) {
          addEdge({
            id: `edge-dep-${t.id}-${dep.dependsOnId}`,
            from: t.id,
            to: dep.dependsOnId,
            type: 'DEPENDS_ON',
            companyId,
            metadata: {},
          });
        }
      }
    }

    return {
      companyId,
      generatedAt: new Date(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      edges,
    };
  }

  /**
   * Traces upward lineage from a Task to its executing Employee, parent Project, and Objective.
   */
  async traceTaskLineage(companyId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedEmployee: { include: { department: true, role: true } },
        project: { include: { client: true } },
        goal: true,
        dependencies: { include: { dependsOn: true } },
      },
    });

    if (!task || task.companyId !== companyId) {
      return null;
    }

    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      employee: task.assignedEmployee
        ? {
            id: task.assignedEmployee.id,
            name: task.assignedEmployee.name,
            role: task.assignedEmployee.role?.title ?? 'Unassigned',
            department: task.assignedEmployee.department?.name ?? 'General',
          }
        : null,
      project: task.project
        ? {
            id: task.project.id,
            name: task.project.name,
            status: task.project.status,
            client: task.project.client?.name ?? null,
          }
        : null,
      objective: task.goal
        ? {
            id: task.goal.id,
            title: task.goal.title,
            status: task.goal.status,
            progress: task.goal.progress,
          }
        : null,
      prerequisites: task.dependencies.map((d) => ({
        id: d.dependsOn.id,
        title: d.dependsOn.title,
        status: d.dependsOn.status,
      })),
    };
  }
}
