import { Injectable } from '@nestjs/common';
import { AgentActionRegistry } from './agent.registry';
import { PrismaService } from '../prisma/prisma.service';

export type PolicyDecision = 'ALLOW' | 'DENY' | 'REQUIRES_APPROVAL';

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

@Injectable()
export class AgentPolicyService {
  constructor(private prisma: PrismaService) {}

  async evaluateAction(
    agentEmployeeId: string,
    agentCompanyId: string,
    actionType: string,
    parameters: any
  ): Promise<PolicyResult> {
    const actionDef = AgentActionRegistry[actionType];
    
    if (!actionDef) {
      return { decision: 'DENY', reason: `Unknown action type: ${actionType}` };
    }

    const agentEmployee = await this.prisma.employee.findUnique({
      where: { id: agentEmployeeId },
      include: { role: true },
    });

    if (!agentEmployee) {
      return { decision: 'DENY', reason: 'Agent employee not found.' };
    }

    // Role-based check
    const permissions = Array.isArray(agentEmployee.role.permissions) 
      ? (agentEmployee.role.permissions as string[]) 
      : [];

    if (actionDef.requiredPermission !== 'BASIC_ACCESS' && !permissions.includes(actionDef.requiredPermission) && !permissions.includes('CHAIRMAN')) {
      return { 
        decision: 'DENY', 
        reason: `Agent lacks required permission: ${actionDef.requiredPermission}` 
      };
    }

    // Cross-company prevention
    if (parameters.companyId && parameters.companyId !== agentCompanyId) {
       return { decision: 'DENY', reason: 'Cross-company operations are forbidden.' };
    }
    
    // For specific entity checks, verify they belong to the agent's company
    if (parameters.employeeId) {
      const targetEmp = await this.prisma.employee.findUnique({ where: { id: parameters.employeeId }});
      if (!targetEmp || targetEmp.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target employee not found or belongs to a different company.' };
      }
    }
    
    if (parameters.taskId) {
      const targetTask = await this.prisma.task.findUnique({ where: { id: parameters.taskId }});
      if (!targetTask || targetTask.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target task not found or belongs to a different company.' };
      }
    }

    if (parameters.projectId) {
      const targetProject = await this.prisma.project.findUnique({ where: { id: parameters.projectId }});
      if (!targetProject || targetProject.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target project not found or belongs to a different company.' };
      }
    }

    if (parameters.conversationId) {
      const targetConv = await this.prisma.conversation.findUnique({ where: { id: parameters.conversationId }});
      if (!targetConv || targetConv.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target conversation not found or belongs to a different company.' };
      }
    }

    if (parameters.meetingId) {
      const targetMeeting = await this.prisma.meeting.findUnique({ where: { id: parameters.meetingId }});
      if (!targetMeeting || targetMeeting.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target meeting not found or belongs to a different company.' };
      }
    }

    if (parameters.sessionId) {
      const targetSession = await this.prisma.intelligenceSession.findUnique({ where: { id: parameters.sessionId }});
      if (!targetSession || targetSession.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target intelligence session not found or belongs to a different company.' };
      }
    }

    if (parameters.proposalId) {
      const targetProposal = await this.prisma.decisionProposal.findUnique({
        where: { id: parameters.proposalId },
        include: { session: true }
      });
      if (!targetProposal || targetProposal.session.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target proposal not found or belongs to a different company.' };
      }
    }

    if (parameters.departmentId) {
      const targetDept = await this.prisma.department.findUnique({ where: { id: parameters.departmentId }});
      if (!targetDept || targetDept.companyId !== agentCompanyId) {
        return { decision: 'DENY', reason: 'Target department not found or belongs to a different company.' };
      }
    }

    // Hard-coded Phase 5 blocks (No financial or governance autonomy)
    const financialActions = ['TRANSFER_AC', 'TRANSFER_FUNDS', 'CHANGE_SALARY', 'PAY_BONUS'];
    const governanceActions = ['CHANGE_PERMISSIONS', 'CHANGE_AUTONOMY', 'FIRE_EMPLOYEE', 'DISABLE_AUDIT', 'APPOINT_CHAIRMAN', 'REMOVE_CHAIRMAN'];
    
    // Phase 6A blocks
    const businessApprovalActions = ['APPROVE_PROPOSAL', 'CREATE_PROJECT'];

    if (financialActions.includes(actionType)) {
      return { decision: 'DENY', reason: 'Financial actions are strictly forbidden for AI agents.' };
    }

    if (governanceActions.includes(actionType)) {
      return { decision: 'DENY', reason: 'Governance actions are strictly forbidden for AI agents.' };
    }

    if (businessApprovalActions.includes(actionType)) {
      return { decision: 'DENY', reason: 'Business approval actions are strictly forbidden for AI agents. Chairman approval required.' };
    }

    if (actionDef.requiresChairmanApproval) {
      return { decision: 'REQUIRES_APPROVAL', reason: 'Action mandates explicit Chairman approval.' };
    }

    return { decision: 'ALLOW', reason: 'Action complies with policy.' };
  }
}
