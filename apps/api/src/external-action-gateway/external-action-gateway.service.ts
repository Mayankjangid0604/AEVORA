import { Injectable, Logger, BadRequestException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment } from '@prisma/client';
import {
  ExternalActionRequest,
  ExternalActionResult,
  ValidatedActionContext,
  GatewayRiskTier,
  ExternalActionAuditRecord,
  GatewayApprovalPreparation,
  ExecutionState,
  ExternalActionStatusCheck,
} from './external-action-gateway.types';
import { RiskClassifierService } from './risk-classifier.service';
import { GatewayAuthorityValidatorService } from './gateway-authority-validator.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { CeoConsequenceAnalysisService } from '../ceo/ceo-consequence-analysis.service';
import { ExternalActionAdapter, AdapterExecutionResult } from './adapters/external-action-adapter.interface';
import { EmailActionAdapter } from './adapters/email-action.adapter';
import { SalesOutreachAdapter } from './adapters/sales-outreach.adapter';
import { MarketingOfferAdapter } from './adapters/marketing-offer.adapter';
import { FinancialActionAdapter } from './adapters/financial-action.adapter';
import { ExternalApiAdapter } from './adapters/external-api.adapter';

@Injectable()
export class ExternalActionGatewayService {
  private readonly logger = new Logger(ExternalActionGatewayService.name);

  // In-memory idempotency cache: keyed by `${companyId}:${idempotencyKey}`
  private readonly idempotencyCache = new Map<
    string,
    { result: ExternalActionResult; actionType: string; payloadHash: string; createdAt: Date }
  >();

  // In-memory audit log store (supplemented by DB transaction logs)
  private readonly auditRecords: ExternalActionAuditRecord[] = [];

  private readonly adapters: ExternalActionAdapter[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskClassifier: RiskClassifierService,
    private readonly authorityValidator: GatewayAuthorityValidatorService,
    private readonly approvalValidation: ApprovalValidationService,
    private readonly consequenceAnalysis: CeoConsequenceAnalysisService,
    private readonly emailAdapter: EmailActionAdapter,
    private readonly salesAdapter: SalesOutreachAdapter,
    private readonly marketingOfferAdapter: MarketingOfferAdapter,
    private readonly financialAdapter: FinancialActionAdapter,
    private readonly externalApiAdapter: ExternalApiAdapter,
  ) {
    this.adapters = [
      this.emailAdapter,
      this.salesAdapter,
      this.marketingOfferAdapter,
      this.financialAdapter,
      this.externalApiAdapter,
    ];
  }

  /**
   * Registers an external action adapter into the gateway execution pool.
   */
  registerAdapter(adapter: ExternalActionAdapter): void {
    if (!this.adapters.some((a) => a.providerName === adapter.providerName)) {
      this.adapters.push(adapter);
      this.logger.log(`Registered external action adapter: ${adapter.providerName}`);
    }
  }

  /**
   * Main Gateway Execution Pipeline:
   * REQUEST
   * → VALIDATE
   * → CLASSIFY RISK
   * → CHECK AUTHORITY
   * → CHECK APPROVAL
   * → APPLY SAFEGUARDS
   * → EXECUTE THROUGH APPROVED ADAPTER
   * → VERIFY RESULT
   * → AUDIT
   * → REPORT OUTCOME
   */
  async executeAction(request: ExternalActionRequest): Promise<ExternalActionResult> {
    const actionId = request.actionId || `act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const { companyId, idempotencyKey, actionType, requestingActorId, requestingActorRole } = request;
    const environment = request.environment || ExecutionEnvironment.PRODUCTION;

    // -------------------------------------------------------------
    // STEP 1: VALIDATE REQUEST & IDEMPOTENCY (ANTI-REPLAY)
    // -------------------------------------------------------------
    if (!companyId) throw new BadRequestException('companyId is required.');
    if (!idempotencyKey) throw new BadRequestException('idempotencyKey is required.');
    if (!requestingActorId) throw new BadRequestException('requestingActorId is required.');
    if (!actionType) throw new BadRequestException('actionType is required.');

    const cacheKey = `${companyId}:${idempotencyKey}`;
    const payloadHash = JSON.stringify({ actionType, target: request.target, payload: request.payload });

    const cachedEntry = this.idempotencyCache.get(cacheKey);
    if (cachedEntry) {
      if (cachedEntry.payloadHash !== payloadHash) {
        throw new ConflictException(
          `Idempotency conflict: Key '${idempotencyKey}' was already used with different parameters for company '${companyId}'.`,
        );
      }
      this.logger.log(`[Idempotent Replay] Returning cached result for action ${cachedEntry.result.actionId}`);
      return {
        ...cachedEntry.result,
        isReplayed: true,
      };
    }

    // -------------------------------------------------------------
    // STEP 2: SANITIZE UNTRUSTED INPUT (PROMPT INJECTION DEFENSE)
    // -------------------------------------------------------------
    const sanitizedPayload = this.authorityValidator.sanitizePayload(request.payload || {});

    // -------------------------------------------------------------
    // STEP 3: PRE-EXECUTION CONSEQUENCE CHECK (SLICE 3 INTEGRATION)
    // -------------------------------------------------------------
    let consequenceReport = request.consequenceReport;
    const requiresConsequence =
      request.financialExposure > 0 ||
      request.reversibility === 'EFFECTIVELY_IRREVERSIBLE' ||
      request.reversibility === 'DIFFICULT_TO_REVERSE' ||
      request.actionType === 'VENDOR_COMMITMENT' ||
      request.actionType === 'TERMINATE_SERVICE';

    if (!consequenceReport && requiresConsequence) {
      try {
        const evalDecision: any = {
          id: actionId,
          companyId,
          ceoEmployeeId: request.ceoId || requestingActorId,
          decisionType: 'OPERATIONS',
          title: `Action: ${actionType}`,
          description: request.intendedEffect,
          proposedAction: request.intendedEffect,
          parameters: sanitizedPayload,
          financialExposure: request.financialExposure,
          reversibility: request.reversibility,
        };
        consequenceReport = await this.consequenceAnalysis.analyzeConsequences(evalDecision);
      } catch (err: any) {
        this.logger.warn(`Consequence analysis auto-evaluation failed: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // STEP 4: CLASSIFY RISK (FOUR-TIER DETERMINISTIC ENGINE)
    // -------------------------------------------------------------
    const riskClassification = this.riskClassifier.classifyRisk({
      ...request,
      consequenceReport,
    });
    const riskTier = riskClassification.riskTier;

    // -------------------------------------------------------------
    // STEP 5: CHECK AUTHORITY & PREVENT SELF-AUTHORIZATION
    // -------------------------------------------------------------
    const authResult = await this.authorityValidator.validateAuthority(
      { ...request, payload: sanitizedPayload },
      riskTier,
    );

    if (!authResult.isAuthorized && !authResult.requiresChairmanApproval) {
      // Hard rejection (e.g. prohibited action, wrong company, missing actor)
      const auditRec = this.createAuditRecord({
        actionId,
        idempotencyKey,
        companyId,
        actorId: requestingActorId,
        actorRole: requestingActorRole,
        actionType,
        targetType: request.target.targetType,
        targetRecipient: request.target.targetRecipient,
        financialExposure: request.financialExposure,
        riskTier,
        reversibility: request.reversibility,
        consequenceSeverity: consequenceReport?.overallSeverity,
        authorityEvaluation: {
          withinAuthority: false,
          reason: authResult.rejectionReason || 'Authority denied.',
          singleLimit: authResult.singleLimit,
        },
        safeguardsApplied: {
          twoStepConfirmed: false,
          cooldownAppliedMs: 0,
          amountVerified: false,
          antiReplayChecked: true,
        },
        executionState: 'REJECTED',
        errorMessage: authResult.rejectionReason,
      });
      this.recordAudit(auditRec);

      throw new ForbiddenException(authResult.rejectionReason);
    }

    // -------------------------------------------------------------
    // STEP 6: CHECK APPROVAL (MANDATORY FOR HIGH AND CRITICAL)
    // -------------------------------------------------------------
    let approvalConsumed = false;
    if (authResult.requiresChairmanApproval || riskTier === 'HIGH' || riskTier === 'CRITICAL') {
      if (!request.approvalId) {
        const errorMsg = `${riskTier} action requires explicit Chairman approval (approvalId is missing).`;
        const auditRec = this.createAuditRecord({
          actionId,
          idempotencyKey,
          companyId,
          actorId: requestingActorId,
          actorRole: requestingActorRole,
          actionType,
          targetType: request.target.targetType,
          targetRecipient: request.target.targetRecipient,
          financialExposure: request.financialExposure,
          riskTier,
          reversibility: request.reversibility,
          consequenceSeverity: consequenceReport?.overallSeverity,
          authorityEvaluation: {
            withinAuthority: false,
            reason: errorMsg,
            singleLimit: authResult.singleLimit,
          },
          safeguardsApplied: {
            twoStepConfirmed: false,
            cooldownAppliedMs: 0,
            amountVerified: false,
            antiReplayChecked: true,
          },
          executionState: 'REJECTED',
          errorMessage: errorMsg,
        });
        this.recordAudit(auditRec);

        throw new UnauthorizedException(errorMsg);
      }

      // Atomically validate and consume the Chairman approval
      try {
        const effectiveCompanyId =
          companyId === 'GLOBAL' || companyId === 'GLOBAL_INFRASTRUCTURE' ? null : (companyId ?? null);
        await this.approvalValidation.validateAndConsumeApproval(request.approvalId, {
          companyId: effectiveCompanyId,
          action: actionType,
          targetType: request.target.targetType,
          targetId: request.target.targetId,
          environment,
          params: sanitizedPayload,
        });
        approvalConsumed = true;
      } catch (err: any) {
        this.logger.error(`[Approval Rejection] ${err.message}`);
        const auditRec = this.createAuditRecord({
          actionId,
          idempotencyKey,
          companyId,
          actorId: requestingActorId,
          actorRole: requestingActorRole,
          actionType,
          targetType: request.target.targetType,
          targetRecipient: request.target.targetRecipient,
          financialExposure: request.financialExposure,
          riskTier,
          reversibility: request.reversibility,
          consequenceSeverity: consequenceReport?.overallSeverity,
          authorityEvaluation: {
            withinAuthority: false,
            reason: `Approval consumption failed: ${err.message}`,
            singleLimit: authResult.singleLimit,
          },
          approvalId: request.approvalId,
          safeguardsApplied: {
            twoStepConfirmed: false,
            cooldownAppliedMs: 0,
            amountVerified: false,
            antiReplayChecked: true,
          },
          executionState: 'REJECTED',
          errorMessage: err.message,
        });
        this.recordAudit(auditRec);

        throw err;
      }
    }

    // -------------------------------------------------------------
    // STEP 7: APPLY SECONDARY SAFEGUARDS (CRITICAL TIER)
    // -------------------------------------------------------------
    if (riskTier === 'CRITICAL') {
      const safeguardCheck = this.authorityValidator.validateCriticalSafeguards(request);
      if (!safeguardCheck.valid) {
        const errorMsg = `CRITICAL safeguards validation failed: ${safeguardCheck.reason}`;
        const auditRec = this.createAuditRecord({
          actionId,
          idempotencyKey,
          companyId,
          actorId: requestingActorId,
          actorRole: requestingActorRole,
          actionType,
          targetType: request.target.targetType,
          targetRecipient: request.target.targetRecipient,
          financialExposure: request.financialExposure,
          riskTier,
          reversibility: request.reversibility,
          consequenceSeverity: consequenceReport?.overallSeverity,
          authorityEvaluation: {
            withinAuthority: false,
            reason: errorMsg,
            singleLimit: authResult.singleLimit,
          },
          approvalId: request.approvalId,
          safeguardsApplied: {
            twoStepConfirmed: false,
            cooldownAppliedMs: request.secondarySafeguards?.cooldownPeriodMs || 0,
            amountVerified: false,
            antiReplayChecked: true,
          },
          executionState: 'REJECTED',
          errorMessage: errorMsg,
        });
        this.recordAudit(auditRec);

        throw new BadRequestException(errorMsg);
      }
    }

    // -------------------------------------------------------------
    // STEP 8: EXECUTE THROUGH APPROVED ADAPTER
    // -------------------------------------------------------------
    const adapter = this.adapters.find((a) => a.supports(actionType));
    if (!adapter) {
      throw new BadRequestException(`No approved adapter found for action type '${actionType}'.`);
    }

    const validatedContext: ValidatedActionContext = {
      actionId,
      idempotencyKey,
      companyId,
      requestingActorId,
      requestingActorRole,
      ceoId: request.ceoId,
      actionType,
      target: request.target,
      intendedEffect: request.intendedEffect,
      sanitizedPayload,
      financialExposure: request.financialExposure,
      riskTier,
      reversibility: request.reversibility,
      consequenceSeverity: consequenceReport?.overallSeverity || 'LOW',
      isAutonomousPermitted: riskClassification.isAutonomousPermitted,
      requiresChairmanApproval: riskClassification.requiresChairmanApproval,
      requiresSecondarySafeguards: riskClassification.requiresSecondarySafeguards,
      approvalId: request.approvalId,
      approvalConsumed,
      environment,
      evaluatedAt: new Date(),
    };

    let executionResult: AdapterExecutionResult;
    try {
      executionResult = await adapter.execute(validatedContext);
    } catch (err: any) {
      this.logger.error(`Adapter execution threw uncaught error: ${err.message}`, err.stack);
      executionResult = {
        success: false,
        provider: adapter.providerName,
        errorMessage: err.message,
      };
    }

    // -------------------------------------------------------------
    // STEP 9: VERIFY RESULT & HANDLE UNCERTAIN EXECUTION STATES
    // -------------------------------------------------------------
    let finalState: ExecutionState = executionResult.success ? 'COMPLETED' : 'FAILED';
    if (executionResult.statusUnknown) {
      finalState = 'UNKNOWN';
      this.logger.warn(`[Uncertain State] Action ${actionId} marked UNKNOWN. Escalation and manual reconciliation required.`);
    }

    const result: ExternalActionResult = {
      actionId,
      idempotencyKey,
      companyId,
      executionState: finalState,
      success: executionResult.success,
      externalReferenceId: executionResult.externalReferenceId,
      provider: executionResult.provider,
      resultPayload: executionResult.resultPayload,
      errorMessage: executionResult.errorMessage,
      executedAt: new Date(),
      isReplayed: false,
    };

    // Cache completed result for anti-replay
    this.idempotencyCache.set(cacheKey, {
      result,
      actionType,
      payloadHash,
      createdAt: new Date(),
    });

    // -------------------------------------------------------------
    // STEP 10: AUDIT & REPORT OUTCOME (IMMUTABLE STRUCTURED AUDIT)
    // -------------------------------------------------------------
    const auditRecord = this.createAuditRecord({
      actionId,
      idempotencyKey,
      companyId,
      actorId: requestingActorId,
      actorRole: requestingActorRole,
      actionType,
      targetType: request.target.targetType,
      targetRecipient: request.target.targetRecipient,
      financialExposure: request.financialExposure,
      riskTier,
      reversibility: request.reversibility,
      consequenceSeverity: consequenceReport?.overallSeverity,
      authorityEvaluation: {
        withinAuthority: true,
        reason: 'Authorized via deterministic gateway checks.',
        singleLimit: authResult.singleLimit,
      },
      approvalId: request.approvalId,
      approverId: request.secondarySafeguards?.confirmedBy,
      safeguardsApplied: {
        twoStepConfirmed: !!request.secondarySafeguards?.requiresSecondaryConfirmation,
        cooldownAppliedMs: request.secondarySafeguards?.cooldownPeriodMs || 0,
        amountVerified: !!request.secondarySafeguards?.amountVerified,
        antiReplayChecked: true,
      },
      executionState: finalState,
      externalProvider: executionResult.provider,
      externalReferenceId: executionResult.externalReferenceId,
      errorMessage: executionResult.errorMessage,
      completedAt: new Date(),
    });
    this.recordAudit(auditRecord);

    return result;
  }

  /**
   * Prepares a structured approval request for Chairman / Command MD review
   * when an action falls into HIGH or CRITICAL risk tiers.
   */
  async prepareApprovalRequest(request: ExternalActionRequest): Promise<GatewayApprovalPreparation> {
    const riskClassification = this.riskClassifier.classifyRisk(request);
    const requestId = `appr_req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return {
      requestId,
      companyId: request.companyId,
      requesterId: request.requestingActorId,
      actionType: request.actionType,
      riskTier: riskClassification.riskTier,
      target: request.target,
      financialExposure: request.financialExposure,
      intendedEffect: request.intendedEffect,
      reversibility: request.reversibility,
      consequenceSummary: {
        overallSeverity: request.consequenceReport?.overallSeverity || 'MEDIUM',
        positiveConsequences: request.consequenceReport?.positiveConsequences || [],
        negativeConsequences: request.consequenceReport?.negativeConsequences || [],
        recommendedMitigation: request.consequenceReport?.recommendedMitigation || [],
      },
      evidence: {
        reasons: riskClassification.reasons,
        payloadSummary: this.authorityValidator.sanitizePayload(request.payload),
      },
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours expiry
      status: 'PENDING_CHAIRMAN_APPROVAL',
    };
  }

  /**
   * Status check for uncertain provider states during reconciliation.
   */
  async checkActionStatus(providerName: string, externalReferenceId: string): Promise<ExternalActionStatusCheck> {
    const adapter = this.adapters.find((a) => a.providerName === providerName);
    if (adapter && adapter.checkStatus) {
      return adapter.checkStatus(externalReferenceId);
    }
    return {
      externalReferenceId,
      status: 'UNKNOWN',
      verifiedAt: new Date(),
    };
  }

  /**
   * Retrieves company-isolated audit trail for compliance and reporting.
   */
  getAuditTrail(companyId: string): ExternalActionAuditRecord[] {
    return this.auditRecords.filter((r) => r.companyId === companyId);
  }

  /**
   * Finds an audit record by its idempotency key, optionally scoped by company.
   */
  getAuditRecordByIdempotencyKey(
    idempotencyKey: string,
    companyId?: string | null,
  ): ExternalActionAuditRecord | undefined {
    return this.auditRecords.find((r) => {
      if (r.idempotencyKey !== idempotencyKey) return false;
      if (companyId && r.companyId && r.companyId !== companyId) return false;
      return true;
    });
  }

  private createAuditRecord(data: Partial<ExternalActionAuditRecord>): ExternalActionAuditRecord {
    return {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actionId: data.actionId || '',
      idempotencyKey: data.idempotencyKey || '',
      companyId: data.companyId || '',
      actorId: data.actorId || '',
      actorRole: data.actorRole || '',
      actionType: data.actionType!,
      targetType: data.targetType || 'SYSTEM',
      targetRecipient: data.targetRecipient,
      financialExposure: data.financialExposure ?? 0,
      riskTier: data.riskTier || 'LOW',
      reversibility: data.reversibility || 'REVERSIBLE',
      consequenceSeverity: data.consequenceSeverity,
      authorityEvaluation: data.authorityEvaluation || { withinAuthority: false, reason: '' },
      approvalId: data.approvalId,
      approverId: data.approverId,
      safeguardsApplied: data.safeguardsApplied || {
        twoStepConfirmed: false,
        cooldownAppliedMs: 0,
        amountVerified: false,
        antiReplayChecked: false,
      },
      executionState: data.executionState || 'PENDING',
      externalProvider: data.externalProvider,
      externalReferenceId: data.externalReferenceId,
      errorMessage: data.errorMessage,
      createdAt: new Date(),
      completedAt: data.completedAt,
    };
  }

  private recordAudit(record: ExternalActionAuditRecord): void {
    this.auditRecords.push(record);
    this.logger.log(
      `[Audit Record Created] ${record.actionType} | Company: ${record.companyId} | Risk: ${record.riskTier} | State: ${record.executionState}`,
    );
  }
}
