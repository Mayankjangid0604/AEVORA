import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRiskLevel, ApprovalRequestStatus, ExecutionEnvironment, RoleAccessLevel } from '@prisma/client';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface CreateApprovalOptions {
  companyId: string;
  requesterId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  proposedParams?: any;
  riskLevel: ApprovalRiskLevel;
  financialImpact?: number;
  reasoning?: string;
  environment?: ExecutionEnvironment;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLoggerService
  ) {}

  async requestApproval(options: CreateApprovalOptions) {
    const environment = options.environment || ExecutionEnvironment.SIMULATION;
    
    // Validate requester (M5 & LOW SYSTEM bypass removed)
    // We expect the requester to be an existing employee
    const requester = await this.prisma.employee.findUnique({ where: { id: options.requesterId } });
    if (!requester || requester.companyId !== options.companyId) {
      this.logger.warn(`UNAUTHORIZED: Invalid requester ${options.requesterId} or company mismatch for company ${options.companyId}`);
      throw new Error('UNAUTHORIZED: Invalid requester or company mismatch');
    }

    // Determine expiry (H3)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days expiry

    // Create approval gate
    const request = await this.prisma.approvalRequest.create({
      data: {
        companyId: options.companyId,
        requesterId: options.requesterId,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId,
        proposedParams: options.proposedParams,
        riskLevel: options.riskLevel,
        financialImpact: options.financialImpact,
        reasoning: options.reasoning,
        environment,
        expiresAt,
      }
    });

    this.logger.log(
      `Approval request ${request.id} created for ${options.action} (Risk: ${options.riskLevel})`,
      ApprovalService.name,
      { companyId: options.companyId, actorId: options.requesterId, environment, action: options.action, requestId: request.id }
    );
    
    // M3: Explicit Auto-Approval Policy
    if (environment === ExecutionEnvironment.SANDBOX && options.riskLevel === ApprovalRiskLevel.LOW) {
       this.logger.log(
         `Auto-approving low-risk request ${request.id} in ${environment}`,
         ApprovalService.name,
         { companyId: options.companyId, requestId: request.id, environment, action: options.action }
       );
       return this.autoResolve(request.id, 'APPROVED', 'Auto-approved in SANDBOX environment');
    }

    return request;
  }

  // Internal auto-resolver that bypasses standard identity checks for SYSTEM automation
  private async autoResolve(requestId: string, decision: 'APPROVED' | 'REJECTED', reason: string) {
    const status = decision === 'APPROVED' ? ApprovalRequestStatus.APPROVED : ApprovalRequestStatus.REJECTED;
    const result = await this.prisma.approvalRequest.updateMany({
      where: { id: requestId, status: ApprovalRequestStatus.PENDING },
      data: { status, approverId: 'SYSTEM', decisionReason: reason, decisionTime: new Date() }
    });
    if (result.count === 0) throw new Error('Request not found or not PENDING');
    return this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
  }

  async resolveApproval(
    requestId: string,
    approverId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== ApprovalRequestStatus.PENDING) {
      throw new Error(`Approval request is no longer PENDING (status: ${request.status})`);
    }

    if (request.expiresAt && request.expiresAt < new Date()) {
      await this.prisma.approvalRequest.updateMany({
        where: { id: requestId, status: ApprovalRequestStatus.PENDING },
        data: { status: ApprovalRequestStatus.EXPIRED }
      });
      throw new Error('Approval request has expired');
    }

    if (approverId === request.requesterId) {
      throw new Error('Self-approval is forbidden');
    }

    if (approverId === 'SYSTEM') {
      throw new Error('SYSTEM identity cannot be used for standard resolution');
    }

    // Verify approver identity and authorization (C1)
    let isAuthorized = false;
    let approverCompanyId: string | null = null;

    // Check if it's a Chairman
    const chairman = await this.prisma.chairman.findUnique({
      where: { id: approverId },
      include: { companies: true }
    });
    if (chairman) {
      const handlesCompany = chairman.companies.some(c => c.id === request.companyId);
      if (handlesCompany) {
        isAuthorized = true;
        approverCompanyId = request.companyId;
      }
    } else {
      // Check if it's an Employee with Management/Chairman role
      const employee = await this.prisma.employee.findUnique({
        where: { id: approverId },
        include: { role: true }
      });
      if (employee) {
        approverCompanyId = employee.companyId;
        if (
          employee.companyId === request.companyId &&
          (employee.role.accessLevel === RoleAccessLevel.MANAGEMENT || employee.role.accessLevel === RoleAccessLevel.CHAIRMAN)
        ) {
          isAuthorized = true;
        }
      }
    }

    if (approverCompanyId !== request.companyId) {
      throw new Error('UNAUTHORIZED: Cross-company approval is strictly forbidden');
    }

    if (!isAuthorized) {
      throw new Error('UNAUTHORIZED: Approver lacks sufficient access level');
    }

    const status = decision === 'APPROVED' ? ApprovalRequestStatus.APPROVED : ApprovalRequestStatus.REJECTED;
    
    // Atomic update to prevent double resolution (H4)
    const updateResult = await this.prisma.approvalRequest.updateMany({
      where: { 
        id: requestId, 
        status: ApprovalRequestStatus.PENDING 
      },
      data: {
        status,
        approverId,
        decisionReason: reason,
        decisionTime: new Date()
      }
    });
    
    if (updateResult.count === 0) {
      throw new Error('Conflict: Request was resolved by another actor or is no longer PENDING');
    }

    this.logger.log(
      `Approval request ${requestId} ${decision} by ${approverId}`,
      ApprovalService.name,
      { companyId: request.companyId, actorId: approverId, environment: request.environment, action: request.action, requestId: request.id, result: decision }
    );
    return this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
  }
}
