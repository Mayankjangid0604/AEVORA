import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EpistemicCertainty } from '@prisma/client';
import { ConflictType, IntegrityFindingType } from './enterprise-intelligence.types';

@Injectable()
export class EnterpriseConflictIntegrityService {
  private readonly logger = new Logger(EnterpriseConflictIntegrityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scans and audits the company's enterprise state for impossible states and integrity violations.
   * Produces structured EnterpriseIntegrityFindings without mutating authoritative reality.
   */
  async auditImpossibleStates(companyId: string): Promise<any[]> {
    const findings: any[] = [];

    // 1. Check for Completed Tasks with Impossible/Unfinished Dependencies
    const tasksWithDeps = await this.prisma.task.findMany({
      where: {
        companyId,
        status: 'COMPLETED',
      },
      include: {
        dependencies: {
          include: {
            dependsOn: true,
          },
        },
      },
    });

    for (const task of tasksWithDeps) {
      if (task.dependencies && task.dependencies.length > 0) {
        const uncompletedPrereqs = task.dependencies.filter(
          (d) => d.dependsOn && d.dependsOn.status !== 'COMPLETED',
        );

        if (uncompletedPrereqs.length > 0) {
          const finding = await this.recordIntegrityFinding({
            companyId,
            findingType: IntegrityFindingType.IMPOSSIBLE_DEPENDENCY,
            severity: 'CRITICAL',
            entityType: 'TASK',
            entityId: task.id,
            description: `Task ${task.id} is marked COMPLETED but has ${uncompletedPrereqs.length} uncompleted prerequisite tasks`,
            details: {
              taskId: task.id,
              uncompletedPrereqs: uncompletedPrereqs.map((d) => ({
                prereqId: d.dependsOnId,
                status: d.dependsOn?.status,
              })),
            },
          });
          findings.push(finding);
        }
      }
    }

    // 2. Check for Verified Outcomes without Required Evidence
    const verifiedOutcomeTasks = await this.prisma.task.findMany({
      where: {
        companyId,
        outcomeState: 'OUTCOME_VERIFIED',
      },
      include: {
        evidenceRecords: true,
      },
    });

    for (const task of verifiedOutcomeTasks) {
      const validEvidence = task.evidenceRecords.filter((e) => e.verificationStatus === 'VERIFIED');
      if (validEvidence.length === 0) {
        const finding = await this.recordIntegrityFinding({
          companyId,
          findingType: IntegrityFindingType.MISSING_EVIDENCE_FOR_OUTCOME,
          severity: 'CRITICAL',
          entityType: 'TASK',
          entityId: task.id,
          description: `Task ${task.id} has OUTCOME_VERIFIED status but 0 verified evidence records`,
          details: { taskId: task.id, totalEvidenceCount: task.evidenceRecords.length },
        });
        findings.push(finding);
      }
    }

    // 3. Check for Execution Attempts without Valid Authority Proof
    const attempts = await this.prisma.taskExecutionAttempt.findMany({
      where: {
        companyId,
        status: { in: ['COMPLETED', 'RUNNING'] },
        authorityProofId: null,
      },
    });

    for (const attempt of attempts) {
      const finding = await this.recordIntegrityFinding({
        companyId,
        findingType: IntegrityFindingType.UNAUTHORIZED_ATTEMPT,
        severity: 'CRITICAL',
        entityType: 'TASK_EXECUTION_ATTEMPT',
        entityId: attempt.id,
        description: `Execution attempt ${attempt.id} (task ${attempt.taskId}) has no authority proof`,
        details: { attemptId: attempt.id, taskId: attempt.taskId, status: attempt.status },
      });
      findings.push(finding);
    }

    // 4. Check for Tasks Assigned to Inactive or Non-Existent Workforce Agents
    const activeTasks = await this.prisma.task.findMany({
      where: {
        companyId,
        status: { in: ['READY', 'IN_PROGRESS'] },
        assignedEmployeeId: { not: null },
      },
    });

    for (const task of activeTasks) {
      if (task.assignedEmployeeId) {
        const employee = await this.prisma.employee.findUnique({
          where: { id: task.assignedEmployeeId },
        });

        if (!employee || employee.companyId !== companyId || employee.status !== 'ACTIVE') {
          const finding = await this.recordIntegrityFinding({
            companyId,
            findingType: IntegrityFindingType.INACTIVE_WORKER_ASSIGNMENT,
            severity: 'HIGH',
            entityType: 'TASK',
            entityId: task.id,
            description: `Active task ${task.id} assigned to inactive/missing worker ${task.assignedEmployeeId}`,
            details: {
              taskId: task.id,
              assignedEmployeeId: task.assignedEmployeeId,
              employeeStatus: employee?.status || 'NOT_FOUND',
            },
          });
          findings.push(finding);
        }
      }
    }

    // 5. Check for Cross-Company References in Projects and Tasks
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      include: { client: true },
    });

    for (const proj of projects) {
      if (proj.client && proj.client.companyId !== companyId) {
        const finding = await this.recordIntegrityFinding({
          companyId,
          findingType: IntegrityFindingType.CROSS_COMPANY_REFERENCE,
          severity: 'CRITICAL',
          entityType: 'PROJECT',
          entityId: proj.id,
          description: `Project ${proj.id} belongs to company ${companyId} but references client of foreign company ${proj.client.companyId}`,
          details: { projectId: proj.id, clientId: proj.clientId, foreignCompanyId: proj.client.companyId },
        });
        findings.push(finding);
      }
    }

    const tasksWithForeignDept = await this.prisma.task.findMany({
      where: { companyId },
      include: { department: true },
    });

    for (const task of tasksWithForeignDept) {
      if (task.department && task.department.companyId !== companyId) {
        const finding = await this.recordIntegrityFinding({
          companyId,
          findingType: IntegrityFindingType.CROSS_COMPANY_REFERENCE,
          severity: 'CRITICAL',
          entityType: 'TASK',
          entityId: task.id,
          description: `Task ${task.id} belongs to company ${companyId} but references department of foreign company ${task.department.companyId}`,
          details: { taskId: task.id, departmentId: task.departmentId, foreignCompanyId: task.department.companyId },
        });
        findings.push(finding);
      }
    }

    // 6. Check for V15 Spatial Contradictions
    const workspaces = await this.prisma.v12SpatialWorkspace.findMany({
      where: { companyId },
      include: { room: true },
    });

    for (const ws of workspaces) {
      if (ws.employeeId) {
        const emp = await this.prisma.employee.findUnique({ where: { id: ws.employeeId } });
        if (emp && emp.companyId !== companyId) {
          const finding = await this.recordIntegrityFinding({
            companyId,
            findingType: IntegrityFindingType.V15_SPATIAL_CONTRADICTION,
            severity: 'CRITICAL',
            entityType: 'SPATIAL_WORKSPACE',
            entityId: ws.id,
            description: `Workspace ${ws.id} of company ${companyId} occupied by employee ${emp.id} of foreign company ${emp.companyId}`,
            details: { workspaceId: ws.id, employeeId: emp.id, employeeCompanyId: emp.companyId },
          });
          findings.push(finding);
        }
      }
    }

    this.logger.log(`[${companyId}] Impossible-state audit complete: ${findings.length} findings recorded`);
    return findings;
  }

  /**
   * Helper to idempotently create or return an existing integrity finding.
   */
  private async recordIntegrityFinding(data: {
    companyId: string;
    findingType: IntegrityFindingType;
    severity: string;
    entityType: string;
    entityId: string;
    description: string;
    details: any;
  }) {
    const existing = await this.prisma.enterpriseIntegrityFinding.findFirst({
      where: {
        companyId: data.companyId,
        findingType: data.findingType,
        entityType: data.entityType,
        entityId: data.entityId,
        status: 'DETECTED',
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.enterpriseIntegrityFinding.create({
      data: {
        companyId: data.companyId,
        findingType: data.findingType,
        severity: data.severity,
        entityType: data.entityType,
        entityId: data.entityId,
        description: data.description,
        details: data.details,
        status: 'DETECTED',
      },
    });
  }

  /**
   * Resolves an open enterprise state conflict deterministically according to authoritative policy.
   * Records the rationale and preserves both historical sources.
   */
  async reconcileConflict(
    companyId: string,
    conflictId: string,
    reconciledById: string,
    authoritativeSource: 'PRIMARY' | 'SECONDARY',
    rationale: string,
  ) {
    const conflict = await this.prisma.enterpriseStateConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict || conflict.companyId !== companyId) {
      throw new NotFoundException(`Conflict ${conflictId} not found for company ${companyId}`);
    }

    if (conflict.resolutionStatus !== 'OPEN') {
      throw new BadRequestException(`Conflict ${conflictId} is already ${conflict.resolutionStatus}`);
    }

    // Determine the winning value
    const winningValue = authoritativeSource === 'PRIMARY' ? conflict.primaryValue : conflict.secondaryValue;
    const winningSource = authoritativeSource === 'PRIMARY' ? conflict.primarySource : conflict.secondarySource;

    // Update conflict resolution record
    const updatedConflict = await this.prisma.enterpriseStateConflict.update({
      where: { id: conflictId },
      data: {
        resolutionStatus: 'RECONCILED',
        resolutionRationale: `Authoritative source selected: ${winningSource}. Rationale: ${rationale}`,
        reconciledById,
        reconciledAt: new Date(),
      },
    });

    // Update active state record to clear conflicted flag
    const currentState = await this.prisma.enterpriseStateRecord.findFirst({
      where: {
        companyId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        stateKey: conflict.field,
        isCurrent: true,
      },
    });

    if (currentState) {
      await this.prisma.enterpriseStateRecord.update({
        where: { id: currentState.id },
        data: {
          stateValue: winningValue as any,
          source: winningSource,
          isConflicted: false,
          conflictReason: null,
          epistemicStatus: EpistemicCertainty.VERIFIED_FACT,
        },
      });
    }

    this.logger.log(`[${companyId}] Reconciled conflict ${conflictId} favoring ${winningSource}`);
    return updatedConflict;
  }

  /**
   * Escalates an unresolved material conflict to the Chairman.
   */
  async escalateConflictToChairman(companyId: string, conflictId: string, escalationReason: string) {
    const conflict = await this.prisma.enterpriseStateConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict || conflict.companyId !== companyId) {
      throw new NotFoundException(`Conflict ${conflictId} not found`);
    }

    return this.prisma.enterpriseStateConflict.update({
      where: { id: conflictId },
      data: {
        escalatedToChairman: true,
        resolutionStatus: 'ESCALATED',
        resolutionRationale: escalationReason,
      },
    });
  }

  /**
   * Retrieves open conflicts for a company.
   */
  async getOpenConflicts(companyId: string) {
    return this.prisma.enterpriseStateConflict.findMany({
      where: { companyId, resolutionStatus: 'OPEN' },
      orderBy: { detectedAt: 'desc' },
    });
  }

  /**
   * Retrieves open integrity findings for a company.
   */
  async getOpenIntegrityFindings(companyId: string) {
    return this.prisma.enterpriseIntegrityFinding.findMany({
      where: { companyId, status: 'DETECTED' },
      orderBy: { createdAt: 'desc' },
    });
  }
}
