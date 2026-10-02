import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { PerformanceStatus, EvaluationWorkflowStatus, EmployeeStatus, TaskStatus } from '@prisma/client';

@Injectable()
export class CeoPerformanceService {
  private readonly logger = new Logger(CeoPerformanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const chairman = await this.prisma.chairman.findUnique({ where: { id: actorId } });
    if (chairman) return { ...chairman, status: 'ACTIVE' as EmployeeStatus }; // Mock Employee shape for Chairman
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async evaluateEmployee(companyId: string, actorId: string, employeeId: string, periodStart: Date, periodEnd: Date) {
    await this.verifyActor(actorId, companyId);
    
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: true,
        role: true,
        ownedKPIs: {
          where: { isAdvisory: true }
        },
        assignedTasks: {
          where: {
            createdAt: { gte: periodStart, lte: periodEnd }
          }
        }
      }
    });

    if (!employee || employee.companyId !== companyId) throw new NotFoundException('Employee not found');

    // KPI Component
    let kpiScore = null;
    if (employee.ownedKPIs.length > 0) {
      const total = employee.ownedKPIs.reduce((sum, kpi) => sum + Math.min(100, Math.max(0, kpi.progressPercentage || 0)), 0);
      kpiScore = Math.round(total / employee.ownedKPIs.length);
    }

    // Task Component
    let taskScore = null;
    if (employee.assignedTasks.length > 0) {
      const completed = employee.assignedTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      taskScore = Math.round((completed / employee.assignedTasks.length) * 100);
    }

    // Overall Score
    let overallScore = null;
    if (kpiScore !== null && taskScore !== null) {
      overallScore = Math.round((kpiScore * 0.7) + (taskScore * 0.3));
    } else if (kpiScore !== null) {
      overallScore = kpiScore;
    } else if (taskScore !== null) {
      overallScore = taskScore;
    }

    let status: PerformanceStatus = PerformanceStatus.INSUFFICIENT_DATA;
    if (overallScore !== null) {
      if (overallScore >= 90) status = PerformanceStatus.EXCEPTIONAL;
      else if (overallScore >= 75) status = PerformanceStatus.STRONG;
      else if (overallScore >= 50) status = PerformanceStatus.STABLE;
      else if (overallScore >= 35) status = PerformanceStatus.AT_RISK;
      else if (overallScore >= 20) status = PerformanceStatus.UNDERPERFORMING;
      else status = PerformanceStatus.CRITICAL;
    }

    const evaluation = await this.prisma.performanceEvaluation.create({
      data: {
        companyId,
        employeeId,
        departmentId: employee.departmentId,
        evaluatorId: actorId,
        periodStart,
        periodEnd,
        workflowStatus: EvaluationWorkflowStatus.DRAFT,
        status,
        overallScore,
        kpiScore,
        taskScore,
        underlyingData: {
          kpiCount: employee.ownedKPIs.length,
          taskCount: employee.assignedTasks.length,
        }
      }
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'EVALUATE_EMPLOYEE',
      objectType: 'PerformanceEvaluation',
      objectId: evaluation.id,
      newValue: { status, overallScore }
    });

    return evaluation;
  }

  async evaluateDepartmentLead(companyId: string, actorId: string, employeeId: string, periodStart: Date, periodEnd: Date) {
    await this.verifyActor(actorId, companyId);
    
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { department: true }
    });
    
    if (!employee || employee.companyId !== companyId) throw new NotFoundException('Employee not found');
    if (!employee.departmentId) throw new BadRequestException('Employee is not in a department');

    const departmentKPIs = await this.prisma.companyKPI.findMany({
      where: { departmentId: employee.departmentId, isAdvisory: true }
    });

    let kpiScore = null;
    if (departmentKPIs.length > 0) {
      const total = departmentKPIs.reduce((sum, kpi) => sum + Math.min(100, Math.max(0, kpi.progressPercentage || 0)), 0);
      kpiScore = Math.round(total / departmentKPIs.length);
    }

    const overallScore = kpiScore;
    let status: PerformanceStatus = PerformanceStatus.INSUFFICIENT_DATA;
    if (overallScore !== null) {
      if (overallScore >= 90) status = PerformanceStatus.EXCEPTIONAL;
      else if (overallScore >= 75) status = PerformanceStatus.STRONG;
      else if (overallScore >= 50) status = PerformanceStatus.STABLE;
      else if (overallScore >= 35) status = PerformanceStatus.AT_RISK;
      else if (overallScore >= 20) status = PerformanceStatus.UNDERPERFORMING;
      else status = PerformanceStatus.CRITICAL;
    }

    const evaluation = await this.prisma.performanceEvaluation.create({
      data: {
        companyId,
        employeeId,
        departmentId: employee.departmentId,
        evaluatorId: actorId,
        periodStart,
        periodEnd,
        workflowStatus: EvaluationWorkflowStatus.DRAFT,
        status,
        overallScore,
        kpiScore,
        isDepartmentLeadEval: true,
        underlyingData: {
          departmentKpiCount: departmentKPIs.length,
        }
      }
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'EVALUATE_DEPARTMENT_LEAD',
      objectType: 'PerformanceEvaluation',
      objectId: evaluation.id,
      newValue: { status, overallScore }
    });

    return evaluation;
  }

  async listEvaluations(companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);
    return this.prisma.performanceEvaluation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { employee: true }
    });
  }

  async createCorrectiveAction(companyId: string, actorId: string, evaluationId: string, title: string, description: string) {
    await this.verifyActor(actorId, companyId);
    const evaluation = await this.prisma.performanceEvaluation.findUnique({ where: { id: evaluationId } });
    if (!evaluation || evaluation.companyId !== companyId) throw new NotFoundException('Evaluation not found');

    const task = await this.prisma.task.create({
      data: {
        companyId,
        createdBy: actorId,
        assignedEmployeeId: evaluation.employeeId,
        title: `[Corrective Action] ${title}`,
        description,
        priority: 'HIGH',
      }
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'CREATE_CORRECTIVE_ACTION',
      objectType: 'Task',
      objectId: task.id,
      newValue: { evaluationId, title }
    });

    return task;
  }
}


