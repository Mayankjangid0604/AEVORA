import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
import { V12NavigationService } from './navigation.service';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';

@Injectable()
export class AssistantAdapter {

  constructor(
    private readonly intelligenceService: CompanyIntelligenceService,
    private readonly employeeService: EmployeeService,
    private readonly departmentService: DepartmentService,
    private readonly prisma: PrismaService,
    private readonly navigationService: V12NavigationService,
    private readonly replaySessions: ReplaySessionService,
    private readonly authService: AuthorizationService,
    private readonly logger: StructuredLoggerService
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

    if (!context.currentCompanyId) {
      return {
        status: 'UNAUTHORIZED',
        correlationId: context.correlationId,
        responseText: 'No company context provided for assistant execution.',
      };
    }

    try {
      await this.authService.checkPermission(userId, 'V12_ASSISTANT_ACCESS', context.currentCompanyId);
    } catch (e: any) {
      this.logger.warn(`Unauthorized V12 assistant intent ${intent} from user ${userId}: ${e.message}`);
      return {
        status: 'UNAUTHORIZED',
        correlationId: context.correlationId,
        responseText: 'You are not authorized to access this company context.',
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
          return await this.handleWhoManagesThis(context);
        }
        case V12IntentType.WHERE_IS_EMPLOYEE: {
          return await this.handleWhereIsEmployee(context, parameters);
        }
        case V12IntentType.NAVIGATE_TO: {
          return await this.handleNavigation(userId, context, parameters);
        }
        case 'CANCEL_NAVIGATION' as any: {
          return await this.handleCancelNavigation(userId, context);
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
        // Security: a client-supplied selectedEntityId must never bypass company isolation —
        // EmployeeService.getEmployee has no company scope of its own, so this adapter enforces it.
        // (Discovered during the Phase 3 security regression audit of every selectedEntityId path,
        // directly relevant now that the VR action endpoint makes selectedEntityId client-settable.)
        if ((employee as any).companyId !== context.currentCompanyId) {
          throw new NotFoundException();
        }
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
        // Same company-isolation enforcement as above — DepartmentService.getDepartment is also unscoped.
        if ((dept as any).companyId !== context.currentCompanyId) {
          throw new NotFoundException();
        }
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

  /**
   * Resolves the manager of a department (or of an employee's department) from authoritative
   * data only: the active employee(s) in that department whose Role.accessLevel is MANAGEMENT
   * or CHAIRMAN, highest Role.level first, tie-broken deterministically by employee ID. There is
   * no explicit "manager" relation in the schema — this derives it from existing role data rather
   * than inventing a new authority field.
   */
  private async handleWhoManagesThis(context: V12ExecutiveAssistantContext): Promise<V12AssistantResponse> {
    if (!context.selectedEntityId) {
      return {
        status: 'AMBIGUOUS',
        correlationId: context.correlationId,
        responseText: 'Please select a department or employee first.',
      };
    }

    let departmentId: string;
    if (context.selectedEntityType === V12EntityType.PERSON) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: context.selectedEntityId, companyId: context.currentCompanyId },
      });
      if (!employee) throw new NotFoundException();
      departmentId = employee.departmentId;
    } else if (context.selectedEntityType === V12EntityType.DEPARTMENT_SPACE) {
      departmentId = context.selectedEntityId;
    } else {
      return {
        status: 'UNSUPPORTED',
        correlationId: context.correlationId,
        responseText: 'I can only resolve a manager for a person or a department.',
      };
    }

    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId: context.currentCompanyId },
    });
    if (!dept) throw new NotFoundException();

    const managers = await this.prisma.employee.findMany({
      where: {
        departmentId,
        companyId: context.currentCompanyId,
        status: 'ACTIVE',
        role: { accessLevel: { in: ['MANAGEMENT', 'CHAIRMAN'] } },
      },
      include: { role: true },
      orderBy: [{ role: { level: 'desc' } }, { id: 'asc' }],
    });

    if (managers.length === 0) {
      return {
        status: 'NOT_FOUND',
        correlationId: context.correlationId,
        responseText: `No manager is currently assigned in the ${dept.name} department.`,
      };
    }

    const manager = managers[0];
    return {
      status: 'SUCCESS',
      correlationId: context.correlationId,
      responseText: `${manager.name} manages the ${dept.name} department.`,
      sourceInformation: 'EmployeeService',
      referencedEntityIds: [manager.id],
    };
  }

  /**
   * Resolves an employee's current location from authoritative V12 spatial state:
   * live movement state first (if MOVING, where they're heading; if settled, their current
   * node), falling back to their assigned workspace. Never infers location from proximity
   * or guesses — reports NOT_FOUND if no spatial record exists.
   */
  private async handleWhereIsEmployee(context: V12ExecutiveAssistantContext, parameters: any): Promise<V12AssistantResponse> {
    let employeeId = context.selectedEntityType === V12EntityType.PERSON ? context.selectedEntityId : undefined;

    if (!employeeId && parameters?.targetName) {
      const matches = await this.prisma.employee.findMany({
        where: {
          companyId: context.currentCompanyId,
          name: { contains: parameters.targetName, mode: 'insensitive' },
        },
      });
      if (matches.length > 1) {
        return {
          status: 'AMBIGUOUS',
          correlationId: context.correlationId,
          responseText: `I found multiple employees matching '${parameters.targetName}'. Please be more specific.`,
        };
      }
      if (matches.length === 1) employeeId = matches[0].id;
    }

    if (!employeeId) {
      return {
        status: 'AMBIGUOUS',
        correlationId: context.correlationId,
        responseText: 'Please specify which employee you mean.',
      };
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: context.currentCompanyId },
    });
    if (!employee) throw new NotFoundException();

    const movement = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId: employeeId } });
    if (movement?.movementState === 'MOVING') {
      return {
        status: 'SUCCESS',
        correlationId: context.correlationId,
        responseText: `${employee.name} is currently moving toward their destination.`,
        sourceInformation: 'V12SpatialMovementState',
        referencedEntityIds: [employee.id],
      };
    }
    if (movement?.movementState === 'IN_MEETING' || movement?.movementState === 'WAITING') {
      return {
        status: 'SUCCESS',
        correlationId: context.correlationId,
        responseText: `${employee.name} is currently at ${movement.currentLocationId}.`,
        sourceInformation: 'V12SpatialMovementState',
        referencedEntityIds: [employee.id],
      };
    }

    const workspace = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId } });
    if (workspace) {
      return {
        status: 'SUCCESS',
        correlationId: context.correlationId,
        responseText: `${employee.name} is at their assigned workspace.`,
        sourceInformation: 'V12SpatialWorkspace',
        referencedEntityIds: [employee.id, workspace.id],
      };
    }

    return {
      status: 'NOT_FOUND',
      correlationId: context.correlationId,
      responseText: `I don't have a spatial location on record for ${employee.name}.`,
    };
  }

  /** Cancels the issuing user's in-progress movement via the authoritative navigation service. */
  private async handleCancelNavigation(userId: string, context: V12ExecutiveAssistantContext): Promise<V12AssistantResponse> {
    const state = await this.navigationService.cancelMovement(userId);
    if (!state) {
      return {
        status: 'SUCCESS',
        correlationId: context.correlationId,
        responseText: 'You are not currently moving.',
      };
    }
    return {
      status: 'SUCCESS',
      correlationId: context.correlationId,
      responseText: 'Navigation cancelled.',
      referencedEntityIds: [userId],
    };
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
      
      const candidates: { type: string, id: string, name: string }[] = [];

      // Find departments
      const departments = await this.prisma.department.findMany({ where: { companyId: context.currentCompanyId } });
      const matchedDepts = departments.filter(d => d.name.toLowerCase().includes(lower) || lower.includes(d.name.toLowerCase()));
      for (const dept of matchedDepts) {
        const space = await this.prisma.v12SpatialRoom.findFirst({ where: { departmentId: dept.id } });
        if (space) {
          const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: space.id } });
          if (node) candidates.push({ type: 'department', id: node.id, name: dept.name });
        }
      }

      // Find rooms
      const rooms = await this.prisma.v12SpatialRoom.findMany({});
      const matchedRooms = rooms.filter(r => r.name?.toLowerCase().includes(lower));
      for (const room of matchedRooms) {
        const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: room.id } });
        if (node) candidates.push({ type: 'room', id: node.id, name: room.name || 'the room' });
      }
      
      // Find employees
      const employees = await this.prisma.employee.findMany({ where: { companyId: context.currentCompanyId }, include: { role: true } });
      const matchedEmps = employees.filter(e => 
        e.name.toLowerCase().includes(lower) || 
        e.role.title.toLowerCase().includes(lower)
      );
      for (const emp of matchedEmps) {
        const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId: emp.id } });
        if (ws) {
          const node = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: ws.roomId } });
          if (node) candidates.push({ type: 'employee', id: node.id, name: `${emp.name}'s office` });
        }
      }

      // Deduplicate candidates by node ID
      const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.id, c])).values());

      if (uniqueCandidates.length > 1) {
        return {
          status: 'AMBIGUOUS',
          correlationId: context.correlationId,
          responseText: `I found multiple matching destinations for '${parameters.targetName}'. Please be more specific.`,
        };
      } else if (uniqueCandidates.length === 1) {
        destNodeId = uniqueCandidates[0].id;
        destName = uniqueCandidates[0].name;
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
      const state = await this.navigationService.requestEntityMovement(chairmanId, destNodeId, { intentSource: 'ASSISTANT', correlationId: context.correlationId });
      
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

export const V12AssistantAdapter = AssistantAdapter;
export type V12AssistantAdapter = AssistantAdapter;
