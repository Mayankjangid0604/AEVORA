import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { 
  V12IntentType, 
  V12ExecutiveAssistantContext, 
  V12AssistantResponse,
  V12EntityType,
  WorldMode
} from '@aevora/shared';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';
import { EmployeeService } from '../employee/employee.service';
import { DepartmentService } from '../department/department.service';
import { PrismaService } from '../prisma/prisma.service';
import { V12NavigationService } from './v12-navigation.service';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';

@Injectable()
export class V12AssistantAdapter {
  private readonly logger = new Logger(V12AssistantAdapter.name);

  constructor(
    private readonly intelligenceService: CompanyIntelligenceService,
    private readonly employeeService: EmployeeService,
    private readonly departmentService: DepartmentService,
    private readonly prisma: PrismaService,
    private readonly navigationService: V12NavigationService,
    private readonly replaySessions: ReplaySessionService,
  ) {}

  async processQuestion(
    userId: string,
    intent: V12IntentType,
    context: V12ExecutiveAssistantContext,
    parameters: any,
    mode?: WorldMode
  ): Promise<V12AssistantResponse> {
    this.logger.log(`Processing assistant question for user ${userId}, intent: ${intent}`);

    // REPLAY is read-only and historical. Consequential intents (movement) and answers sourced from live
    // enterprise data are both refused here; historical inspection is served from replay state client-side.
    if (mode === WorldMode.REPLAY || this.replaySessions.isReplayActive(userId)) {
      this.logger.warn(`Assistant intent ${intent} from ${userId} refused: REPLAY_READ_ONLY`);
      return {
        status: 'REPLAY_READ_ONLY',
        correlationId: context.correlationId,
        responseText: intent === V12IntentType.NAVIGATE_TO
          ? 'Movement commands are disabled while viewing historical replay.'
          : 'Live enterprise lookups are disabled during replay; inspect the historical state on the replay timeline instead.',
      };
    }

    try {
      switch (intent) {
        case V12IntentType.INSPECT_ENTITY:
        case V12IntentType.WHO_IS_THIS:
        case V12IntentType.WHAT_IS_THIS: {
          return await this.handleInspectEntity(context);
        }
        case V12IntentType.WHO_MANAGES_THIS: {
          return {
            status: 'UNSUPPORTED',
            correlationId: context.correlationId,
            responseText: 'I cannot determine the manager for this entity yet.',
          };
        }
        case V12IntentType.WHERE_IS_EMPLOYEE: {
          return {
            status: 'UNSUPPORTED',
            correlationId: context.correlationId,
            responseText: 'I cannot locate specific employees yet.',
          };
        }
        case V12IntentType.NAVIGATE_TO: {
          return await this.handleNavigation(userId, context, parameters);
        }
        case 'CANCEL_NAVIGATION' as any: {
          return {
            status: 'UNSUPPORTED',
            correlationId: context.correlationId,
            responseText: 'NOT IMPLEMENTED — BACKEND CAPABILITY MISSING.',
          };
        }
        case 'GIVE_ME_A_BRIEFING' as any: {
          return await this.handleBriefing(context);
        }
        default:
          return {
            status: 'UNSUPPORTED',
            correlationId: context.correlationId,
            responseText: 'I do not understand this question or the backend does not support it.',
          };
      }
    } catch (e: any) {
      if (e instanceof ForbiddenException) {
        return {
          status: 'UNAUTHORIZED',
          correlationId: context.correlationId,
          responseText: 'You are not authorized to access this information.',
        };
      }
      if (e instanceof NotFoundException) {
        return {
          status: 'NOT_FOUND',
          correlationId: context.correlationId,
          responseText: 'The requested information could not be found in Aevora.',
        };
      }
      
      this.logger.error(`Assistant error: ${e.message}`, e.stack);
      return {
        status: 'ERROR',
        correlationId: context.correlationId,
        responseText: 'An error occurred while fetching authoritative data.',
      };
    }
  }

  private async handleInspectEntity(context: V12ExecutiveAssistantContext): Promise<V12AssistantResponse> {
    if (!context.selectedEntityId) {
      return {
        status: 'AMBIGUOUS',
        correlationId: context.correlationId,
        responseText: 'I am not sure what you are referring to. Please select an entity.',
      };
    }

    if (context.selectedEntityType === V12EntityType.PERSON) {
      try {
        const employee = await this.employeeService.getEmployee(context.selectedEntityId);
        return {
          status: 'SUCCESS',
          correlationId: context.correlationId,
          responseText: `This is ${employee.name}, working as a ${employee.role.title} in the ${employee.department?.name || 'company'}.`,
          sourceInformation: 'EmployeeService',
          referencedEntityIds: [employee.id]
        };
      } catch (e) {
        throw new NotFoundException();
      }
    } else if (context.selectedEntityType === V12EntityType.DEPARTMENT_SPACE) {
      try {
        const dept = await this.departmentService.getDepartment(context.selectedEntityId);
        return {
          status: 'SUCCESS',
          correlationId: context.correlationId,
          responseText: `This is the ${dept.name} department.`,
          sourceInformation: 'DepartmentService',
          referencedEntityIds: [dept.id]
        };
      } catch (e) {
        throw new NotFoundException();
      }
    } else {
      return {
        status: 'UNSUPPORTED',
        correlationId: context.correlationId,
        responseText: 'I can only provide details on people and departments currently.',
      };
    }
  }

  private async handleBriefing(context: V12ExecutiveAssistantContext): Promise<V12AssistantResponse> {
    const companyId = context.currentCompanyId;
    if (!companyId) {
      return {
        status: 'AMBIGUOUS',
        correlationId: context.correlationId,
        responseText: 'I cannot provide a briefing without a company context.',
      };
    }

    const intel = await this.intelligenceService.generateCompanyIntelligence(companyId, { period: 'current' });
    
    let text = `Here is your company briefing. `;
    if (intel.facts.length > 0) {
      text += intel.facts[0].statement + " ";
    }
    if (intel.risks.length > 0) {
      text += `There are ${intel.risks.length} risk areas identified. `;
    }
    
    return {
      status: 'SUCCESS',
      correlationId: context.correlationId,
      responseText: text.trim(),
      structuredData: intel,
      sourceInformation: 'CompanyIntelligenceService'
    };
  }

  private async handleNavigation(userId: string, context: V12ExecutiveAssistantContext, parameters: any): Promise<V12AssistantResponse> {
    if (!parameters.targetName && !context.selectedEntityId) {
      return {
        status: 'AMBIGUOUS',
        correlationId: context.correlationId,
        responseText: 'I am not sure where you want to go. Please specify a destination.',
      };
    }

    let destNodeId: string | null = null;
    let destName = '';

    // Resolution Layer
    if (parameters.targetName) {
      const lower = parameters.targetName.toLowerCase();
      // Try to resolve as department name
      const departments = await this.prisma.department.findMany({ where: { companyId: context.currentCompanyId } });
      const dept = departments.find(d => d.name.toLowerCase().includes(lower) || lower.includes(d.name.toLowerCase()));
      
      if (dept) {
        // Find a space for this department
        const space = await this.prisma.v12SpatialRoom.findFirst({ where: { departmentId: dept.id } });
        if (space) {
          const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: space.id } });
          if (node) {
            destNodeId = node.id;
            destName = dept.name;
          }
        }
      }

      if (!destNodeId) {
        // Try room directly
        const rooms = await this.prisma.v12SpatialRoom.findMany({});
        const room = rooms.find(r => r.name?.toLowerCase().includes(lower));
        if (room) {
           const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: room.id } });
           if (node) {
             destNodeId = node.id;
             destName = room.name || 'the room';
           }
        }
      }
      
      if (!destNodeId) {
         // Try employee (e.g. CEO)
         const employees = await this.prisma.employee.findMany({ where: { companyId: context.currentCompanyId }, include: { role: true } });
         const emp = employees.find(e => 
           e.name.toLowerCase().includes(lower) || 
           e.role.title.toLowerCase().includes(lower)
         );
         if (emp) {
            // Find their workspace
            const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId: emp.id } });
            if (ws) {
               const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: ws.roomId } });
               if (node) {
                  destNodeId = node.id;
                  destName = `${emp.name}'s office`;
               }
            }
         }
      }
    } else if (context.selectedEntityId) {
      // Navigate to selected entity
      const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: context.selectedEntityId } });
      if (node) {
         destNodeId = node.id;
         destName = 'your selection';
      }
    }

    if (!destNodeId) {
      return {
        status: 'NOT_FOUND',
        correlationId: context.correlationId,
        responseText: `I could not find a determinable location for ${parameters.targetName || 'that'}.`,
      };
    }

    try {
      // In this setup, we assume the user issuing the command is the entity moving (e.g., the Chairman)
      const chairmanId = userId; // or map from user to employee
      const state = await this.navigationService.requestEntityMovement(chairmanId, destNodeId, { intentSource: 'ASSISTANT' });
      
      if (state && state.movementState === 'BLOCKED') {
         return {
           status: 'ERROR',
           correlationId: context.correlationId,
           responseText: `I can't reach ${destName} from here. ${state.blockedReason || ''}`.trim()
         };
      }

      return {
        status: 'SUCCESS',
        correlationId: context.correlationId,
        responseText: `Taking you to ${destName}.`,
        referencedEntityIds: [destNodeId] // Could provide route details here if needed
      };
    } catch (e: any) {
      return {
        status: 'ERROR',
        correlationId: context.correlationId,
        responseText: `Could not initiate movement: ${e.message}`,
      };
    }
  }
}
