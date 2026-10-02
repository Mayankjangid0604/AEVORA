import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { SuccessionRiskLevel, SuccessionStatus, CandidateReadiness, ManagementDecisionType, EmployeeStatus } from '@prisma/client';

@Injectable()
export class CeoSuccessionService {
  private readonly logger = new Logger(CeoSuccessionService.name);

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

  async createSuccessionPlan(companyId: string, actorId: string, roleId: string, departmentId?: string) {
    await this.verifyActor(actorId, companyId);
    
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || (role.companyId && role.companyId !== companyId)) throw new NotFoundException('Role not found');

    const employees = await this.prisma.employee.findMany({
      where: { roleId, departmentId, companyId, status: EmployeeStatus.ACTIVE }
    });

    const currentHolderId = employees.length > 0 ? employees[0].id : null;
    const status = currentHolderId ? SuccessionStatus.HEALTHY : SuccessionStatus.CRITICAL_VACANCY;
    const riskLevel = currentHolderId ? SuccessionRiskLevel.LOW : SuccessionRiskLevel.CRITICAL;

    const plan = await this.prisma.successionPlan.create({
      data: {
        companyId,
        roleId,
        departmentId,
        currentHolderId,
        status,
        riskLevel,
      }
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'CREATE_SUCCESSION_PLAN',
      objectType: 'SuccessionPlan',
      objectId: plan.id,
      newValue: { roleId, departmentId }
    });

    return plan;
  }

  async addCandidate(companyId: string, actorId: string, planId: string, employeeId: string) {
    await this.verifyActor(actorId, companyId);
    
    const plan = await this.prisma.successionPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.companyId !== companyId) throw new NotFoundException('Plan not found');

    const candidate = await this.prisma.successionCandidate.create({
      data: {
        planId,
        employeeId,
        readiness: CandidateReadiness.NOT_READY,
      }
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'ADD_SUCCESSION_CANDIDATE',
      objectType: 'SuccessionCandidate',
      objectId: candidate.id,
      newValue: { employeeId }
    });

    await this.evaluateReadiness(companyId, actorId, candidate.id);
    return candidate;
  }

  async evaluateReadiness(companyId: string, actorId: string, candidateId: string) {
    await this.verifyActor(actorId, companyId);
    const candidate = await this.prisma.successionCandidate.findUnique({ 
      where: { id: candidateId },
      include: { employee: { include: { evaluations: { orderBy: { createdAt: 'desc' }, take: 1 } } } }
    });
    
    if (!candidate) throw new NotFoundException('Candidate not found');

    const latestEval = candidate.employee.evaluations[0];
    let readiness: CandidateReadiness = CandidateReadiness.NOT_READY;
    let reason = 'Insufficient performance data';

    if (latestEval) {
      if (latestEval.overallScore && latestEval.overallScore >= 90) {
        readiness = CandidateReadiness.READY;
        reason = 'Exceptional performance history';
      } else if (latestEval.overallScore && latestEval.overallScore >= 75) {
        readiness = CandidateReadiness.READY_SOON;
        reason = 'Strong performance history';
      } else if (latestEval.overallScore && latestEval.overallScore >= 50) {
        readiness = CandidateReadiness.DEVELOPING;
        reason = 'Stable performance history';
      } else {
        readiness = CandidateReadiness.NOT_READY;
        reason = 'Performance history indicates risk';
      }
    }

    const updated = await this.prisma.successionCandidate.update({
      where: { id: candidateId },
      data: { readiness, eligibilityReason: reason }
    });

    // Update plan risk based on candidates
    const plan = await this.prisma.successionPlan.findUnique({ where: { id: candidate.planId }, include: { candidates: true } });
    if (plan) {
      const readyCount = plan.candidates.filter(c => c.readiness === CandidateReadiness.READY).length;
      const developingCount = plan.candidates.filter(c => c.readiness === CandidateReadiness.READY_SOON || c.readiness === CandidateReadiness.DEVELOPING).length;
      
      let newRisk: SuccessionRiskLevel = plan.currentHolderId ? SuccessionRiskLevel.LOW : SuccessionRiskLevel.CRITICAL;
      if (!plan.currentHolderId && readyCount > 0) newRisk = SuccessionRiskLevel.HIGH;
      else if (plan.currentHolderId && readyCount === 0 && developingCount === 0) newRisk = SuccessionRiskLevel.HIGH;
      
      await this.prisma.successionPlan.update({
        where: { id: plan.id },
        data: { riskLevel: newRisk }
      });
    }

    return updated;
  }

  async createReplacementRecommendation(companyId: string, actorId: string, planId: string, candidateId: string, reason: string) {
    await this.verifyActor(actorId, companyId);
    
    const plan = await this.prisma.successionPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.companyId !== companyId) throw new NotFoundException('Plan not found');
    
    const candidate = await this.prisma.successionCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.planId !== planId) throw new NotFoundException('Candidate not found');

    const decision = await this.prisma.managementDecision.create({
      data: {
        companyId,
        proposerId: actorId,
        targetEmployeeId: candidate.employeeId,
        type: ManagementDecisionType.REPLACEMENT,
        title: `Replacement Recommendation for Role ${plan.roleId}`,
        description: reason,
        payload: {
          planId,
          candidateId,
          currentHolderId: plan.currentHolderId
        }
      }
    });

    await this.prisma.successionCandidate.update({
      where: { id: candidateId },
      data: { recommendationStatus: 'PENDING' }
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'CREATE_REPLACEMENT_RECOMMENDATION',
      objectType: 'ManagementDecision',
      objectId: decision.id,
      newValue: { planId, candidateId }
    });

    return decision;
  }
}


