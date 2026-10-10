import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { canonicalizeJson, computeContentHash } from '../task/evidence-verification.service';
import {
  AuthorityTier,
  AuthorityGrantStatus,
  CeoDecisionRiskLevel,
  EmergencyState,
  AUTHORITY_TIER_RANK,
  RISK_TIER_RANK,
  MAX_DELEGATION_DEPTH,
  AuthorityContext,
  CreateAuthorityGrantDto,
  AuthorityEvaluation,
  AuthorityProofReplayResult,
} from './authority-context.types';
import { ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class GovernedAuthorityService {
  private readonly logger = new Logger(GovernedAuthorityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly approvalValidationService?: ApprovalValidationService,
  ) {}

  /**
   * Issues a governed, context-bound authority grant.
   * Enforces:
   * - Strict company isolation.
   * - Strict hierarchy: Granter must outrank Grantee (or have delegated authority).
   * - Anti-amplification: Child grants cannot exceed parent grant's capabilities, actions, risk, or expiration.
   * - Maximum delegation depth (depth <= 3).
   * - Prevention of self-authorization.
   */
  async createGrant(dto: CreateAuthorityGrantDto) {
    const {
      companyId,
      granterId,
      granterRole,
      granterTier,
      granteeId,
      granteeRole,
      granteeTier,
      capability,
      actionScope,
      resourceScope = [],
      maxRiskTier = CeoDecisionRiskLevel.LOW,
      parentGrantId,
      expiresAt,
      commandId,
      correlationId,
      causationId,
    } = dto;

    if (!companyId) {
      throw new BadRequestException('Authority grant requires explicit companyId');
    }

    // 1. Verify Company exists
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    // 2. Prevent Self-Authorization
    if (granterId === granteeId && granterTier !== AuthorityTier.CHAIRMAN) {
      this.logger.error(`[Authority] Self-authorization attempt rejected for actor ${granterId}`);
      throw new ForbiddenException('Actors cannot issue authority grants to themselves');
    }

    // 3. Strict Hierarchy Enforcement: Granter rank must be higher (lower numeric value)
    const granterRank = AUTHORITY_TIER_RANK[granterTier];
    const granteeRank = AUTHORITY_TIER_RANK[granteeTier];

    if (granterRank >= granteeRank && granterTier !== AuthorityTier.CHAIRMAN) {
      this.logger.error(
        `[Authority] Hierarchy violation: ${granterTier} (rank ${granterRank}) cannot grant authority to ${granteeTier} (rank ${granteeRank})`,
      );
      throw new ForbiddenException(
        `Hierarchy violation: Actor with tier ${granterTier} cannot grant authority to ${granteeTier}`,
      );
    }

    // 4. Recursive Delegation Limits & Anti-Amplification
    let delegationDepth = 0;
    if (parentGrantId) {
      const parent = await this.prisma.authorityGrant.findFirst({
        where: { id: parentGrantId, companyId },
      });

      if (!parent) {
        throw new NotFoundException(`Parent grant ${parentGrantId} not found in company ${companyId}`);
      }

      if (parent.status !== AuthorityGrantStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot delegate from inactive parent grant ${parentGrantId} (status: ${parent.status})`,
        );
      }

      if (parent.expiresAt && parent.expiresAt < new Date()) {
        throw new BadRequestException(`Cannot delegate from expired parent grant ${parentGrantId}`);
      }

      delegationDepth = parent.delegationDepth + 1;
      if (delegationDepth > MAX_DELEGATION_DEPTH) {
        throw new BadRequestException(
          `Delegation depth limit (${MAX_DELEGATION_DEPTH}) exceeded. Requested depth: ${delegationDepth}`,
        );
      }

      // Anti-amplification: Child grant cannot exceed parent risk ceiling
      const riskOrder = [
        CeoDecisionRiskLevel.LOW,
        CeoDecisionRiskLevel.MEDIUM,
        CeoDecisionRiskLevel.HIGH,
        CeoDecisionRiskLevel.CRITICAL,
      ];
      if (riskOrder.indexOf(maxRiskTier) > riskOrder.indexOf(parent.maxRiskTier)) {
        throw new ForbiddenException(
          `Delegation amplification blocked: Child grant risk (${maxRiskTier}) cannot exceed parent risk (${parent.maxRiskTier})`,
        );
      }

      // Anti-amplification: Child actionScope cannot exceed parent actionScope
      const parentActions = (parent.actionScope as string[]) || [];
      if (!parentActions.includes('*')) {
        const unpermitted = actionScope.filter((a) => !parentActions.includes(a));
        if (unpermitted.length > 0) {
          throw new ForbiddenException(
            `Delegation amplification blocked: Child grant includes action(s) [${unpermitted.join(', ')}] not authorized in parent grant`,
          );
        }
      }

      // Child expiration cannot exceed parent expiration
      if (parent.expiresAt) {
        if (!expiresAt || expiresAt > parent.expiresAt) {
          throw new BadRequestException(
            `Child grant expiration cannot exceed parent grant expiration (${parent.expiresAt.toISOString()})`,
          );
        }
      }
    }

    // 5. Create canonical AuthorityGrant
    const grant = await this.prisma.authorityGrant.create({
      data: {
        companyId,
        granterId,
        granterRole,
        granterTier,
        granteeId,
        granteeRole,
        granteeTier,
        capability,
        actionScope,
        resourceScope,
        maxRiskTier,
        delegationDepth,
        parentGrantId: parentGrantId || null,
        status: AuthorityGrantStatus.ACTIVE,
        validFrom: new Date(),
        expiresAt: expiresAt || null,
        commandId: commandId || null,
        correlationId: correlationId || null,
        causationId: causationId || null,
      },
    });

    this.logger.log(
      `[Authority] Issued AuthorityGrant ${grant.id} [${capability}] to ${granteeRole}:${granteeId} (tier: ${granteeTier}, depth: ${delegationDepth})`,
    );

    // Emit authoritative CompanyEvent
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'AUTHORITY_GRANT_ISSUED',
        payload: {
          grantId: grant.id,
          granterId,
          granteeId,
          capability,
          maxRiskTier,
          delegationDepth,
          parentGrantId,
          expiresAt,
          correlationId,
          causationId,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit AUTHORITY_GRANT_ISSUED event: ${e.message}`));

    return grant;
  }

  /**
   * Immediate Authority Revocation.
   * Immediately revokes the grant and recursively revokes all derived child grants.
   * Preserves historical actions intact while instantly halting future operations.
   */
  async revokeGrant(
    grantId: string,
    companyId: string,
    optionsOrRevokedBy: { revokedBy: string; reason: string } | string,
    maybeReason?: string,
  ) {
    if (!companyId) {
      throw new BadRequestException('Revocation requires explicit companyId');
    }

    const revokedBy = typeof optionsOrRevokedBy === 'string' ? optionsOrRevokedBy : optionsOrRevokedBy.revokedBy;
    const reason = typeof optionsOrRevokedBy === 'string' ? (maybeReason || 'Revoked by authority') : optionsOrRevokedBy.reason;

    const grant = await this.prisma.authorityGrant.findFirst({
      where: { id: grantId, companyId },
      include: { childGrants: true },
    });

    if (!grant) {
      throw new NotFoundException(`Authority grant ${grantId} not found in company ${companyId}`);
    }

    const now = new Date();
    const revokedGrantIds: string[] = [grant.id];

    // 1. Revoke the target grant
    await this.prisma.authorityGrant.update({
      where: { id: grant.id },
      data: {
        status: AuthorityGrantStatus.REVOKED,
        revokedAt: now,
        revokedBy,
        revocationReason: reason,
      },
    });

    // 2. Cascade revocation recursively to all child grants in the delegation tree
    const revokeChildren = async (parentGId: string) => {
      const children = await this.prisma.authorityGrant.findMany({
        where: { parentGrantId: parentGId, companyId, status: AuthorityGrantStatus.ACTIVE },
      });
      for (const child of children) {
        await this.prisma.authorityGrant.update({
          where: { id: child.id },
          data: {
            status: AuthorityGrantStatus.REVOKED,
            revokedAt: now,
            revokedBy,
            revocationReason: `Cascaded revocation from parent grant ${parentGId}: ${reason}`,
          },
        });
        revokedGrantIds.push(child.id);
        await revokeChildren(child.id);
      }
    };

    await revokeChildren(grant.id);

    // Emit authoritative CompanyEvent
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'AUTHORITY_GRANT_REVOKED',
        payload: {
          grantId: grant.id,
          revokedGrantIds,
          revokedBy,
          reason,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit AUTHORITY_GRANT_REVOKED event: ${e.message}`));

    this.logger.warn(
      `[Authority] Revoked grant ${grant.id} and ${revokedGrantIds.length - 1} cascaded child grant(s) in company ${companyId}`,
    );

    return {
      revokedGrantId: grant.id,
      totalRevoked: revokedGrantIds.length,
      revokedGrantIds,
      revokedAt: now,
    };
  }

  /**
   * Suspends an authority grant (e.g. after execution failure threshold or caution state).
   */
  async suspendGrant(grantId: string, companyId: string, actorId: string, reason?: string) {
    if (!companyId) {
      throw new BadRequestException('Company ID is required');
    }
    const grant = await this.prisma.authorityGrant.findFirst({
      where: { id: grantId, companyId },
    });
    if (!grant) {
      throw new NotFoundException(`Authority grant ${grantId} not found in company ${companyId}`);
    }
    return this.prisma.authorityGrant.update({
      where: { id: grantId },
      data: {
        status: AuthorityGrantStatus.SUSPENDED,
        revocationReason: reason || 'Suspended by authority policy',
      },
    });
  }

  /**
   * Reinstates a suspended authority grant.
   */
  async reinstateGrant(grantId: string, companyId: string, actorId: string) {
    if (!companyId) {
      throw new BadRequestException('Company ID is required');
    }
    const grant = await this.prisma.authorityGrant.findFirst({
      where: { id: grantId, companyId },
    });
    if (!grant) {
      throw new NotFoundException(`Authority grant ${grantId} not found in company ${companyId}`);
    }
    return this.prisma.authorityGrant.update({
      where: { id: grantId },
      data: {
        status: AuthorityGrantStatus.ACTIVE,
        revocationReason: null,
      },
    });
  }

  /**
   * Idempotent Continuous Authority Reconciliation.
   * Expires stale grants, checks emergency states, and purges expired temporary authority.
   */
  async reconcileAuthority(companyId: string) {
    if (!companyId) {
      throw new BadRequestException('Reconciliation requires explicit companyId');
    }

    const now = new Date();

    // Expire grants past their expiration deadline
    const expired = await this.prisma.authorityGrant.updateMany({
      where: {
        companyId,
        status: AuthorityGrantStatus.ACTIVE,
        expiresAt: { lt: now },
      },
      data: {
        status: AuthorityGrantStatus.EXPIRED,
      },
    });

    if (expired.count > 0) {
      this.logger.log(
        `[Authority] Reconciled and expired ${expired.count} stale authority grant(s) in company ${companyId}`,
      );
    }

    return {
      companyId,
      expiredCount: expired.count,
      reconciledAt: now,
    };
  }

  /**
   * Evaluates authority for an intended action and produces a machine-verifiable AuthorityProof.
   * Guarantees:
   * - Prohibits self-authorization actions (GRANT_AUTHORITY, MODIFY_OWNERSHIP).
   * - Enforces company isolation.
   * - Enforces EmergencyState: blocks autonomous execution during EMERGENCY_STOP.
   * - Enforces V16 4-tier risk governance and mandatory Chairman approval for HIGH/CRITICAL.
   * - Atomically validates and consumes single-use approvals via ApprovalValidationService.
   */
  async evaluateAndProveAuthority(context: AuthorityContext): Promise<AuthorityEvaluation> {
    const {
      companyId,
      actorId,
      actorRole,
      actorTier,
      actionType,
      targetEntity,
      targetId,
      parameters,
      grantId,
      commandId,
      approvalId,
      riskTier,
      correlationId,
      causationId,
    } = context;

    const parametersHash = computeContentHash(parameters);
    const delegationChain: string[] = [];

    // 1. Prohibited Actions (Self-Authorization Prevention)
    if (actionType === 'GRANT_AUTHORITY' || actionType === 'MODIFY_OWNERSHIP') {
      const reason = `Action '${actionType}' is strictly prohibited: Autonomous systems cannot grant authority or modify ownership.`;
      await this.createAuthorityProofRecord({
        companyId,
        actorId,
        actorRole,
        actorTier,
        actionType,
        targetEntity,
        targetId,
        parametersHash,
        riskTier,
        isAuthorized: false,
        rejectionReason: reason,
        delegationChain,
        correlationId,
        causationId,
      });

      return {
        isAuthorized: false,
        actorTier,
        rejectionReason: reason,
        requiresApproval: false,
        approvalConsumed: false,
        riskTier,
        delegationChain,
      };
    }

    // 2. Company & Emergency State Check
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    if (company.emergencyStatus === EmergencyState.EMERGENCY_STOP) {
      // Only explicit Chairman emergency recovery authority can execute during EMERGENCY_STOP
      if (actorTier !== AuthorityTier.CHAIRMAN && actionType !== 'EMERGENCY_RECOVERY_OPERATION') {
        const reason = `Operation blocked: Company is in EMERGENCY_STOP status (${companyId}). Autonomous consequential actions are suspended.`;
        await this.createAuthorityProofRecord({
          companyId,
          actorId,
          actorRole,
          actorTier,
          actionType,
          targetEntity,
          targetId,
          parametersHash,
          riskTier,
          isAuthorized: false,
          rejectionReason: reason,
          delegationChain,
          correlationId,
          causationId,
        });

        return {
          isAuthorized: false,
          actorTier,
          rejectionReason: reason,
          requiresApproval: true,
          approvalConsumed: false,
          riskTier,
          delegationChain,
        };
      }
    }

    // 3. Grant Validation for non-Chairman actors
    let evaluatedGrant: any = null;
    const effectiveGrantId = grantId || context.authorityGrantId;
    if (actorTier !== AuthorityTier.CHAIRMAN) {
      if (effectiveGrantId) {
        evaluatedGrant = await this.prisma.authorityGrant.findFirst({
          where: { id: effectiveGrantId, companyId },
          include: { parentGrant: true },
        });

        if (!evaluatedGrant) {
          return this.failEvaluation(
            context,
            parametersHash,
            `Authority grant ${effectiveGrantId} not found in company ${companyId}`,
          );
        }

        if (evaluatedGrant.granteeId !== actorId) {
          return this.failEvaluation(
            context,
            parametersHash,
            `Grant ownership mismatch: grant ${effectiveGrantId} belongs to ${evaluatedGrant.granteeId}, not actor ${actorId}`,
          );
        }

        if (evaluatedGrant.status !== AuthorityGrantStatus.ACTIVE) {
          const reason =
            evaluatedGrant.status === AuthorityGrantStatus.EXPIRED
              ? 'Grant has expired'
              : `Grant is ${evaluatedGrant.status}`;
          return this.failEvaluation(
            context,
            parametersHash,
            `Authority grant ${effectiveGrantId} is not ACTIVE (current status: ${evaluatedGrant.status}) — ${reason}`,
          );
        }

        if (evaluatedGrant.expiresAt && evaluatedGrant.expiresAt < new Date()) {
          return this.failEvaluation(
            context,
            parametersHash,
            `Authority grant ${effectiveGrantId} has expired at ${evaluatedGrant.expiresAt.toISOString()} — Grant has expired`,
          );
        }

        // Trace delegation chain recursively via parentGrantId
        delegationChain.push(evaluatedGrant.id);
        let currId = evaluatedGrant.parentGrantId;
        while (currId) {
          delegationChain.push(currId);
          const parent: any = await this.prisma.authorityGrant.findUnique({
            where: { id: currId },
          });
          currId = parent?.parentGrantId || null;
        }

        // Check action scope if restricted
        const allowedActions = (evaluatedGrant.actionScope as string[]) || [];
        if (
          allowedActions.length > 0 &&
          !allowedActions.includes(actionType) &&
          !allowedActions.includes('*')
        ) {
          return this.failEvaluation(
            context,
            parametersHash,
            `Action '${actionType}' is outside authorized action scope: [${allowedActions.join(', ')}]`,
          );
        }

        // Check risk ceiling against grant
        const actionRiskRank = RISK_TIER_RANK[riskTier] ?? 0;
        const maxGrantRiskRank = RISK_TIER_RANK[evaluatedGrant.maxRiskTier] ?? 0;
        if (actionRiskRank > maxGrantRiskRank) {
          return this.failEvaluation(
            context,
            parametersHash,
            `Action risk tier ${riskTier} exceeds grant ceiling ${evaluatedGrant.maxRiskTier}`,
          );
        }
      }
    }

    // 4. Risk-Adaptive Confirmation & Mandatory Approval Checking
    // The sovereign Chairman and explicit emergency recovery operations do not require subordinate approvals
    const requiresApproval =
      actorTier !== AuthorityTier.CHAIRMAN &&
      !context.isEmergencyRecovery &&
      (riskTier === CeoDecisionRiskLevel.HIGH || riskTier === CeoDecisionRiskLevel.CRITICAL);

    let approvalConsumed = false;
    if (requiresApproval) {
      if (!approvalId) {
        return this.failEvaluation(
          context,
          parametersHash,
          `High/Critical risk action '${actionType}' requires approved V16 ApprovalRequest. None provided.`,
        );
      }

      // Consume approval via ApprovalValidationService if available
      if (this.approvalValidationService) {
        try {
          await this.approvalValidationService.validateAndConsumeApproval(approvalId, {
            companyId,
            action: actionType,
            targetType: targetEntity,
            targetId,
            environment: ExecutionEnvironment.PRODUCTION,
            params: parameters,
          });
          approvalConsumed = true;
        } catch (err: any) {
          return this.failEvaluation(
            context,
            parametersHash,
            `Approval validation failed: ${err.message}`,
          );
        }
      } else {
        // Fallback direct check against ApprovalRequest if service not injected
        const approval = await this.prisma.approvalRequest.findFirst({
          where: { id: approvalId, companyId },
        });

        if (!approval || approval.status !== 'APPROVED') {
          return this.failEvaluation(
            context,
            parametersHash,
            `Approval ${approvalId} is not in APPROVED state or does not exist for company ${companyId}`,
          );
        }
        approvalConsumed = true;
      }
    }

    // 5. Issue Machine-Verifiable Authority Proof
    const proof = await this.createAuthorityProofRecord({
      companyId,
      actorId,
      actorRole,
      actorTier,
      actionType,
      targetEntity,
      targetId,
      parametersHash,
      authorityGrantId: evaluatedGrant?.id || null,
      commandId: commandId || null,
      approvalId: approvalId || null,
      riskTier,
      isAuthorized: true,
      delegationChain,
      correlationId,
      causationId,
    });

    this.logger.log(
      `[Authority] Generated valid AuthorityProof ${proof.id} for action '${actionType}' by ${actorRole}:${actorId} (tier: ${actorTier}, risk: ${riskTier})`,
    );

    return {
      isAuthorized: true,
      actorTier,
      grantId: evaluatedGrant?.id,
      proofId: proof.id,
      proof,
      requiresApproval,
      approvalConsumed,
      riskTier,
      delegationChain,
    };
  }

  /**
   * Deterministic Authority Replay.
   * Replays an historical authorization proof without modifying active state.
   */
  async replayAuthorityProof(
    proofId: string,
    companyId?: string,
  ): Promise<AuthorityProofReplayResult> {
    const where: any = { id: proofId };
    if (companyId) {
      where.companyId = companyId;
    }
    const proof = await this.prisma.authorityProof.findFirst({
      where,
      include: { authorityGrant: true },
    });

    if (!proof) {
      throw new NotFoundException(`AuthorityProof ${proofId} not found`);
    }

    const auditNotes: string[] = [];
    let isHistoricallyValid = proof.isAuthorized;

    if (!proof.isAuthorized) {
      auditNotes.push(`Proof was recorded as UNAUTHORIZED. Rejection reason: ${proof.rejectionReason}`);
    } else {
      auditNotes.push(`Proof was recorded as AUTHORIZED under policy ${proof.policyVersion}`);
    }

    if (proof.authorityGrant || proof.authorityGrantId) {
      const gId = proof.authorityGrant?.id || proof.authorityGrantId;
      auditNotes.push(`Active authority grant existed (${gId}) at time of execution`);
      if (proof.authorityGrant) {
        auditNotes.push(
          `Linked AuthorityGrant ${proof.authorityGrant.id}: granter=${proof.authorityGrant.granterId}, capability=${proof.authorityGrant.capability}`,
        );
      }
    }

    const reconstructedChain = (proof.delegationChain as string[]) || [];

    return {
      proofId: proof.id,
      originalTimestamp: proof.timestamp,
      actorId: proof.actorId,
      actorRole: proof.actorRole,
      actorTier: proof.actorTier,
      actionType: proof.actionType,
      parametersHash: proof.parametersHash,
      isHistoricallyValid,
      reconstructedChain,
      auditNotes,
      replayedAt: new Date(),
    };
  }

  private async failEvaluation(
    context: AuthorityContext,
    parametersHash: string,
    rejectionReason: string,
  ): Promise<AuthorityEvaluation> {
    this.logger.warn(`[Authority Rejected] ${rejectionReason}`);

    const proof = await this.createAuthorityProofRecord({
      companyId: context.companyId,
      actorId: context.actorId,
      actorRole: context.actorRole,
      actorTier: context.actorTier,
      actionType: context.actionType,
      targetEntity: context.targetEntity,
      targetId: context.targetId,
      parametersHash,
      authorityGrantId: context.grantId || null,
      commandId: context.commandId || null,
      approvalId: context.approvalId || null,
      riskTier: context.riskTier,
      isAuthorized: false,
      rejectionReason,
      delegationChain: [],
      correlationId: context.correlationId,
      causationId: context.causationId,
    });

    return {
      isAuthorized: false,
      actorTier: context.actorTier,
      proofId: proof.id,
      proof,
      rejectionReason,
      requiresApproval: context.riskTier === CeoDecisionRiskLevel.HIGH || context.riskTier === CeoDecisionRiskLevel.CRITICAL,
      approvalConsumed: false,
      riskTier: context.riskTier,
      delegationChain: [],
    };
  }

  private async createAuthorityProofRecord(data: {
    companyId: string;
    actorId: string;
    actorRole: string;
    actorTier: AuthorityTier;
    actionType: string;
    targetEntity?: string;
    targetId?: string;
    parametersHash: string;
    authorityGrantId?: string | null;
    commandId?: string | null;
    approvalId?: string | null;
    riskTier: CeoDecisionRiskLevel;
    isAuthorized: boolean;
    rejectionReason?: string | null;
    delegationChain: string[];
    correlationId?: string;
    causationId?: string;
  }) {
    return this.prisma.authorityProof.create({
      data: {
        companyId: data.companyId,
        actorId: data.actorId,
        actorRole: data.actorRole,
        actorTier: data.actorTier,
        actionType: data.actionType,
        targetEntity: data.targetEntity || null,
        targetId: data.targetId || null,
        parametersHash: data.parametersHash,
        authorityGrantId: data.authorityGrantId || null,
        commandId: data.commandId || null,
        approvalId: data.approvalId || null,
        riskTier: data.riskTier,
        isAuthorized: data.isAuthorized,
        rejectionReason: data.rejectionReason || null,
        delegationChain: data.delegationChain,
        correlationId: data.correlationId || null,
        causationId: data.causationId || null,
      },
    });
  }
}
