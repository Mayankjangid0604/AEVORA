import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { AgentContextBuilder } from './agent-context.service';
import { AgentPolicyService } from './agent-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModelGateway } from '@aevora/model-gateway';
import { AgentStatus, ExecutionStatus } from '@prisma/client';
import { TaskService } from '../task/task.service';
import { MemoryService } from './memory.service';
import { ProjectExecutionService } from '../project-execution/project-execution.service';
import { ManagementDecisionService } from '../company-operations/management-decision.service';
import { TrainingService } from '../company-operations/training.service';
import { ManagementDecisionType } from '@prisma/client';
import { MessageService, MessageSenderType, MessageType } from '../communication/message.service';
import { MeetingService } from '../communication/meeting.service';
import { ConversationService } from '../communication/conversation.service';
import { IntelligenceSessionService } from '../intelligence/services/intelligence-session.service';
import { PlanningService } from '../intelligence/services/planning.service';
import { DecisionProposalService } from '../intelligence/services/decision-proposal.service';
import { AssistanceRequestService } from '../intelligence/services/assistance-request.service';
import { RiskDetectionService } from '../intelligence/services/risk-detection.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

@Injectable()
export class WorkCycleService {
  private readonly logger = new Logger(WorkCycleService.name);
  constructor(
    private contextBuilder: AgentContextBuilder,
    private policy: AgentPolicyService,
    private prisma: PrismaService,
    private taskService: TaskService,
    private memory: MemoryService,
    private projectExecutionService: ProjectExecutionService,
    private managementDecisionService: ManagementDecisionService,
    private trainingService: TrainingService,
    private messageService: MessageService,
    private meetingService: MeetingService,
    private conversationService: ConversationService,
    private intelligenceSessionService: IntelligenceSessionService,
    private planningService: PlanningService,
    private decisionProposalService: DecisionProposalService,
    private assistanceRequestService: AssistanceRequestService,
    private riskDetectionService: RiskDetectionService,
    private outcomeService: OutcomeService
  ) {}

  async runWorkCycle(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { employee: true }
    });

    if (!agent || agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException('Agent is not active');
    }
    const emp = agent.employee;
    if (!emp) throw new BadRequestException('Agent has no employee');

    // Create Execution Record
    const execution = await this.prisma.agentExecution.create({
      data: {
        agentId,
        companyId: emp.companyId,
        employeeId: emp.id,
        provider: 'local',
        model: 'local-stub',
        status: ExecutionStatus.RUNNING,
        contextSnapshot: {}, // Will update
        proposedActions: [],
      }
    });

    try {
      const { systemInstructions, contextData } = await this.contextBuilder.buildContext(agentId);
      
      await this.prisma.agentExecution.update({
        where: { id: execution.id },
        data: { contextSnapshot: contextData }
      });

      // Stub gateway
      const gateway = new ModelGateway(); // Using model gateway
      const response = await gateway.generate({
        systemMessage: systemInstructions,
        prompt: JSON.stringify(contextData),
        requireStructuredOutput: true
      });

      const proposedActions = (response.structuredOutput?.actions || []) as Array<{ type: string, parameters: any }>;
      const accepted = [];
      const rejected = [];

      for (const action of proposedActions) {
        const policyDecision = await this.policy.evaluateAction(emp.id, emp.companyId, action.type, action.parameters);
        
        if (policyDecision.decision === 'DENY') {
          rejected.push({ action, reason: policyDecision.reason });
          continue;
        }

        // Execute action through domain services
        try {
          await this.executeAction(action, emp.id, emp.companyId);
          accepted.push(action);
        } catch (err: any) {
          rejected.push({ action, reason: `Execution failed: ${err.message}` });
        }
      }

      // Memory
      if (accepted.length > 0) {
        await this.memory.createMemory(agent.id, 'EPISODIC', `Executed actions: ${accepted.map(a => a.type).join(', ')}`);
      }

      await this.prisma.agentExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          proposedActions,
          acceptedActions: accepted,
          rejectedActions: rejected
        }
      });

      return { executionId: execution.id, accepted, rejected };

    } catch (error: any) {
      await this.prisma.agentExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: error.message
        }
      });
      throw error;
    }
  }

  /**
   * Executes an allowed action through the appropriate domain service.
   * The AI agent NEVER touches the database directly — all mutations
   * go through domain service methods that enforce business rules.
   */
  private async executeAction(action: { type: string, parameters: any }, empId: string, companyId: string) {
    const p = action.parameters || {};

    switch (action.type) {
      // ── Basic employee work actions ────────────────────────────────────────
      case 'START_MY_TASK':
        await this.taskService.startTask(p.taskId, empId);
        break;

      case 'UPDATE_MY_TASK_PROGRESS':
        if (p.taskId) {
          await this.taskService.updateTaskProgress(p.taskId, p.progress, companyId);
        }
        break;

      case 'SUBMIT_MY_TASK_FOR_REVIEW':
        await this.projectExecutionService.submitTaskForReview(p.taskId, companyId);
        break;

      case 'COMPLETE_MY_TASK':
        await this.taskService.completeTask(p.taskId);
        break;

      // ── Project Manager actions ────────────────────────────────────────────
      case 'CREATE_PROJECT_REQUIREMENT':
        await this.projectExecutionService.createRequirement(p.projectId, {
          title: p.title,
          description: p.description,
          priority: p.priority,
          acceptanceCriteria: p.acceptanceCriteria,
          source: p.source || 'AI_PROJECT_MANAGER'
        });
        break;

      case 'CREATE_PROJECT_PLAN':
        await this.projectExecutionService.createPlan(p.projectId, {
          summary: p.summary,
          assumptions: p.assumptions,
          risks: p.risks,
          estimatedDuration: p.estimatedDuration
        });
        break;

      case 'CREATE_PROJECT_MILESTONE':
        await this.projectExecutionService.createMilestone(p.projectId, {
          name: p.name,
          description: p.description,
          sequence: p.sequence,
          dueAt: p.dueAt
        });
        break;

      case 'CREATE_PROJECT_RISK':
        await this.projectExecutionService.createRisk(p.projectId, {
          title: p.title,
          description: p.description,
          probability: p.probability,
          impact: p.impact,
          mitigation: p.mitigation
        });
        break;

      case 'CREATE_PROJECT_TASK':
        await this.projectExecutionService.createProjectTask(companyId, p.projectId, {
          title: p.title,
          description: p.description,
          assignedEmployeeId: p.assignedEmployeeId,
          priority: p.priority,
          estimatedEffort: p.estimatedEffort,
          dependencies: p.dependencies || []
        }, empId);
        break;

      case 'UPDATE_PROJECT_TASK':
        if (p.taskId) {
          await this.taskService.updateTask(p.taskId, {
            ...(p.status && { status: p.status }),
            ...(p.progress !== undefined && { progress: p.progress }),
          });
        }
        break;

      case 'PROPOSE_PROJECT_STAFFING':
        await this.projectExecutionService.proposeStaffing(p.projectId, {
          employeeId: p.employeeId,
          role: p.role,
          allocation: p.allocation
        });
        break;

      // ── Phase 6C: Company Operations & Management Actions ───────────────
      case 'CREATE_TRAINING_RECOMMENDATION':
        await this.trainingService.createTrainingRecommendation(
          companyId,
          p.employeeId,
          p.skillName,
          p.skillCategory,
          empId
        );
        break;

      case 'CREATE_PROMOTION_PROPOSAL':
        await this.managementDecisionService.proposeDecision(
          companyId,
          empId,
          ManagementDecisionType.PROMOTION,
          p.title || 'Promotion Proposal',
          p.description || '',
          p.employeeId,
          { newRoleId: p.newRoleId, newRoleTitle: p.newRoleTitle }
        );
        break;

      case 'CREATE_BONUS_PROPOSAL':
        await this.managementDecisionService.proposeDecision(
          companyId,
          empId,
          ManagementDecisionType.BONUS,
          p.title || 'Bonus Proposal',
          p.description || '',
          p.employeeId,
          { amount: p.amount }
        );
        break;

      case 'CREATE_DISCIPLINARY_ACTION':
        await this.managementDecisionService.proposeDecision(
          companyId,
          empId,
          ManagementDecisionType.DISCIPLINE,
          p.title || 'Disciplinary Action',
          p.description || '',
          p.employeeId,
          { severity: p.severity, reason: p.reason }
        );
        break;

      case 'CREATE_HIRING_REQUEST':
        await this.managementDecisionService.proposeDecision(
          companyId,
          empId,
          ManagementDecisionType.HIRING,
          p.title || 'Hiring Request',
          p.description || '',
          undefined,
          { roleTitle: p.roleTitle, departmentId: p.departmentId, headcount: p.headcount }
        );
        break;

      case 'CREATE_WORKLOAD_REBALANCING_PROPOSAL':
        await this.managementDecisionService.proposeDecision(
          companyId,
          empId,
          ManagementDecisionType.WORKLOAD_REBALANCING,
          p.title || 'Workload Rebalancing',
          p.description || '',
          p.employeeId,
          { taskId: p.taskId, newAssigneeId: p.newAssigneeId }
        );
        break;

      // ── Phase 10: Communication & Collaboration Actions ─────────────────
      case 'SEND_MESSAGE':
        await this.messageService.sendMessage(
          companyId,
          p.conversationId,
          empId,
          MessageSenderType.EMPLOYEE,
          p.content,
          MessageType.TEXT,
          p.metadata
        );
        break;

      case 'REPLY_TO_MESSAGE':
        await this.messageService.sendMessage(
          companyId,
          p.conversationId,
          empId,
          MessageSenderType.EMPLOYEE,
          p.content,
          MessageType.TEXT,
          p.metadata,
          p.parentMessageId
        );
        break;

      case 'PROPOSE_MEETING':
        await this.meetingService.scheduleMeeting(
          companyId,
          empId,
          p.title,
          new Date(p.scheduledAt),
          p.durationMinutes || 30,
          p.participantIds || [],
          p.projectId,
          p.departmentId,
          p.description
        );
        break;

      case 'ADD_MEETING_AGENDA_ITEM':
        await this.meetingService.addAgendaItem(p.meetingId, p.title, p.description);
        break;

      // ── Phase 12: Employee Intelligence Actions ─────────────────────────
      case 'START_INTELLIGENCE_SESSION':
        await this.intelligenceSessionService.createSession(companyId, empId, p.objective, { taskId: p.taskId, projectId: p.projectId });
        break;

      case 'CREATE_WORK_PLAN':
        if (p.sessionId) {
          await this.planningService.createPlan(p.sessionId, p.objective, p.steps || []);
        }
        break;

      case 'UPDATE_WORK_PLAN':
        if (p.planId && p.stepId && p.status) {
          await this.planningService.updateStepStatus(p.stepId, p.status);
        }
        break;

      case 'ASSESS_RISK':
        if (p.sessionId) {
          await this.riskDetectionService.recordRiskObservation(p.sessionId, {
            category: p.category,
            description: p.description,
            severity: p.severity,
            likelihood: p.likelihood,
            evidence: p.evidence,
            mitigation: p.mitigation
          });
        }
        break;

      case 'IDENTIFY_BLOCKER':
        if (p.sessionId && p.taskId) {
          await this.taskService.blockTask(p.taskId);
        }
        break;

      case 'PROPOSE_DECISION':
        await this.decisionProposalService.createProposal(companyId, empId, {
          sessionId: p.sessionId,
          title: p.title,
          problem: p.problem,
          recommendation: p.recommendation,
          rationale: p.rationale,
          confidence: p.confidence,
          impactLevel: p.impactLevel,
          options: p.options
        });
        break;

      case 'REQUEST_HELP':
      case 'ESCALATE_ISSUE':
        await this.assistanceRequestService.requestAssistance(companyId, empId, {
          question: p.question || p.issue,
          reason: p.reason,
          urgency: p.urgency || 'HIGH',
          targetEmployeeId: p.targetEmployeeId,
          taskId: p.taskId,
          projectId: p.projectId
        });
        break;

      case 'REQUEST_TRAINING':
        await this.trainingService.createTrainingRecommendation(
          companyId,
          empId,
          p.skillName,
          p.skillCategory,
          empId
        );
        break;

      case 'REVIEW_OUTCOME':
        if (p.sessionId) {
          await this.outcomeService.recordOutcome(p.sessionId, {
            result: p.result,
            actualOutcome: p.actualOutcome,
            expectedOutcome: p.expectedOutcome,
            success: p.success,
            lessons: p.lessons
          });
          await this.intelligenceSessionService.completeSession(p.sessionId);
        }
        break;

      case 'REVIEW_DECISION_PROPOSAL':
      case 'APPROVE_DECISION':
      case 'REJECT_DECISION':
      case 'REQUEST_MORE_INFORMATION':
        if (p.proposalId) {
          let result = 'REQUEST_MORE_INFORMATION';
          if (action.type === 'APPROVE_DECISION') result = 'APPROVE';
          else if (action.type === 'REJECT_DECISION') result = 'REJECT';
          
          await this.decisionProposalService.reviewProposal(p.proposalId, empId, result as any, p.feedback);
        }
        break;

      // ── Read-only actions — no side effects ───────────────────────────────
      case 'VIEW_PROJECT':
      case 'VIEW_PROJECT_REQUIREMENTS':
      case 'VIEW_PROJECT_PLAN':
      case 'VIEW_PROJECT_TASKS':
      case 'VIEW_PROJECT_TEAM':
      case 'VIEW_PROJECT_RISKS':
      case 'VIEW_PROJECT_MILESTONES':
      case 'VIEW_MY_TASKS':
      case 'VIEW_COMPANY':
      case 'VIEW_DEPARTMENT':
      case 'VIEW_EMPLOYEE':
      case 'VIEW_EMPLOYEE_SKILLS':
      case 'VIEW_EMPLOYEE_HISTORY':
      case 'VIEW_COMPANY_CAPABILITIES':
      case 'VIEW_DEPARTMENTS':
      case 'VIEW_ACTIVE_WORKLOAD':
      case 'VIEW_CLIENT':
      case 'VIEW_COMPANY_METRICS':
      case 'VIEW_DEPARTMENT_METRICS':
      case 'VIEW_OPERATIONAL_ALERTS':
      case 'VIEW_CONVERSATION':
        // Read actions are policy-validated and recorded but have no DB mutation
        break;

      default:
        // Reject unknown actions explicitly
        this.logger.warn(`[WorkCycle] Unknown action attempted by agent: ${action.type}`);
        throw new BadRequestException(`Unknown or unsupported action type: ${action.type}`);
    }
  }
}
