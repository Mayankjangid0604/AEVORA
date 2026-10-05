import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment } from '@prisma/client';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { AgentActionRegistry } from '../agent/agent.registry';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { ExecutionGateError } from '../common/errors/error-taxonomy';

export interface ProductionActionParams {
  actorId: string;
  companyId: string;
  environment: ExecutionEnvironment;
  capability: string;
  action: string;
  resourceId?: string;
  parameters: any;
  approvalId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class ProductionExecutionGateService {
  private readonly logger = new Logger(ProductionExecutionGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalValidationService: ApprovalValidationService,
    private readonly structuredLogger: StructuredLoggerService
  ) {}

  async authorizeProductionAction(params: ProductionActionParams): Promise<void> {
    const {
      actorId,
      companyId,
      environment,
      capability,
      action,
      resourceId,
      approvalId,
      idempotencyKey,
      parameters
    } = params;

    // 1. Environment check
    if (environment !== ExecutionEnvironment.PRODUCTION) {
      // Gate is primarily for production
      return;
    }

    // 2. Actor and Tenant verification
    const actor = await this.prisma.employee.findUnique({
      where: { id: actorId },
      include: { role: true }
    });
    if (!actor) {
      throw new ExecutionGateError('AUTHENTICATION_ERROR', 'Actor not found');
    }
    if (actor.companyId !== companyId) {
      throw new ExecutionGateError('TENANT_ISOLATION_ERROR', 'Actor does not belong to company');
    }

    // 3. Capability verification (Integration must be enabled)
    const prodCap = await this.prisma.productionCapability.findUnique({
      where: { companyId_capability_environment: { companyId, capability, environment } }
    });
    if (!prodCap || !prodCap.isEnabled) {
      throw new ExecutionGateError('AUTHORIZATION_ERROR', `Integration ${capability} is not enabled for production.`);
    }

    // 4. Kill Switch checks
    const globalKill = await this.prisma.killSwitchConfig.findFirst({
      where: { companyId: null, feature: 'GLOBAL_PRODUCTION' }
    });
    if (globalKill?.isDisabled) {
      throw new ExecutionGateError('PRODUCTION_DISABLED', 'Global production is currently disabled.');
    }

    const companyKill = await this.prisma.killSwitchConfig.findUnique({
      where: { companyId_feature: { companyId, feature: 'COMPANY_PRODUCTION' } }
    });
    if (companyKill?.isDisabled) {
      throw new ExecutionGateError('PRODUCTION_DISABLED', 'Company production is disabled.');
    }

    const capabilityKill = await this.prisma.killSwitchConfig.findUnique({
      where: { companyId_feature: { companyId, feature: capability } }
    });
    if (capabilityKill?.isDisabled) {
      throw new ExecutionGateError('PRODUCTION_DISABLED', `Capability ${capability} is disabled.`);
    }

    // 5. Phase 24: Check Production Rollout State
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        productionTransactionLimit: true,
      }
    });

    if (!company) {
      throw new ExecutionGateError('COMPANY_NOT_FOUND', 'Company not found');
    }

    // ARMED state check: Explicitly allowlist harmless actions, block everything else
    const armedAllowedCapabilities = [
      'READ_ONLY_ACCESS', 
      'SIMULATION', 
      'PROPOSAL_GENERATION', 
      'CREATE_INVOICE'
    ];
    if (company.productionState === 'ARMED' && !armedAllowedCapabilities.includes(capability)) {
        throw new ExecutionGateError('PRODUCTION_DISABLED', `Company production state ARMED prevents general execution of ${capability}.`);
    }

    if (company.productionState === 'DISABLED' || company.productionState === 'EMERGENCY_STOP' || company.productionState === 'PAUSED') {
      throw new ExecutionGateError('PRODUCTION_DISABLED', `Company production state is ${company.productionState}`);
    }

    // 6. Phase 24: First-customer allowlist check
    if (parameters?.clientId) {
      const isAllowed = await this.prisma.productionAllowlist.findUnique({
        where: { clientId: parameters.clientId, companyId: companyId }
      });
      if (!isAllowed) {
        throw new ExecutionGateError('CUSTOMER_NOT_ALLOWLISTED', 'Target customer is not on the production allowlist.');
      }
    }

    // 7. Phase 24: Transaction limits
    if (parameters?.amount !== undefined) {
      const limit = company.productionTransactionLimit;
      if (!limit || limit.maxAmount === 0 || parameters.amount > limit.maxAmount) {
        throw new ExecutionGateError('TRANSACTION_LIMIT_EXCEEDED', 'Transaction amount exceeds production limits or no limits configured.');
      }
    }

    // 8. Policy / Approval check (Moved to end to prevent premature consumption)
    const actionDef = AgentActionRegistry[capability];
    const requiresApproval = actionDef?.requiresChairmanApproval;

    if (requiresApproval && !approvalId) {
      throw new ExecutionGateError('APPROVAL_REQUIRED', 'Production action requires explicit approval');
    }

    if (approvalId) {
      await this.approvalValidationService.validateAndConsumeApproval(approvalId, {
        companyId,
        action: capability,
        environment,
        params: parameters,
        targetId: resourceId
      });
    }

    // 9. Idempotency Check (Placeholder - actual storage might depend on the specific external action log)
    // In a real implementation, we'd log this attempt atomically. 
    this.structuredLogger.log(`Production execution authorized for ${action} by ${actorId} in ${companyId}`, ProductionExecutionGateService.name, { companyId, actorId, environment, capability, action, resourceId, approvalId, idempotencyKey });
  }
}
