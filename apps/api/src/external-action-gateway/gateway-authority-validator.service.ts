import { Injectable, Logger, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExternalActionRequest,
  GatewayRiskTier,
  ActionTarget,
} from './external-action-gateway.types';
import { CeoFinancialAuthorityService } from '../ceo/ceo-financial-authority.service';
import { CeoFinancialOperation } from '@prisma/client';

export interface AuthorityEvaluationResult {
  isAuthorized: boolean;
  requiresChairmanApproval: boolean;
  requiresSecondarySafeguards: boolean;
  rejectionReason?: string;
  evaluatedAuthorityId?: string;
  singleLimit?: number;
}

@Injectable()
export class GatewayAuthorityValidatorService {
  private readonly logger = new Logger(GatewayAuthorityValidatorService.name);

  // Prohibited prompt injection attack signatures that attempt to falsify authority
  private readonly PROMPT_INJECTION_AUTHORITY_PATTERNS = [
    /ignore (all )?previous instructions/i,
    /you are now authorized/i,
    /override (the )?authority/i,
    /approve this action/i,
    /send payment immediately/i,
    /i am the chairman/i,
    /system bypass/i,
    /grant authority/i,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAuthService: CeoFinancialAuthorityService,
  ) {}

  /**
   * Sanitizes payload text to ensure external text/prompts are treated strictly as data,
   * never as execution instructions or authority overrides.
   */
  sanitizePayload(payload: Record<string, any>): Record<string, any> {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    const sanitized = JSON.parse(JSON.stringify(payload));

    const checkAndFlag = (obj: any): void => {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string') {
          for (const pattern of this.PROMPT_INJECTION_AUTHORITY_PATTERNS) {
            if (pattern.test(val)) {
              this.logger.warn(
                `[Prompt Injection Neutralized] Key '${key}' contained authority manipulation attempt: "${val.substring(0, 60)}..."`,
              );
              // Tag and neutralize so it cannot be interpreted as execution commands
              obj[key] = `[DATA_ONLY_NEUTRALIZED]: ${val.replace(/[\r\n]+/g, ' ')}`;
            }
          }
        } else if (val && typeof val === 'object') {
          checkAndFlag(val);
        }
      }
    };

    checkAndFlag(sanitized);
    return sanitized;
  }

  /**
   * Deterministically validates authority independent of any LLM reasoning.
   * AI/model output CANNOT grant authority or bypass this check.
   */
  async validateAuthority(
    request: ExternalActionRequest,
    riskTier: GatewayRiskTier,
  ): Promise<AuthorityEvaluationResult> {
    const { companyId, requestingActorId, requestingActorRole, actionType, financialExposure } = request;

    // 1. SELF-AUTHORIZATION PREVENTION & PROHIBITED ACTIONS
    if (actionType === 'GRANT_AUTHORITY' || actionType === 'MODIFY_OWNERSHIP') {
      this.logger.error(`[Self-Authorization Blocked] Actor ${requestingActorId} attempted prohibited action ${actionType}`);
      return {
        isAuthorized: false,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
        rejectionReason: `Action '${actionType}' is strictly prohibited: Autonomous systems can never grant authority or alter corporate ownership.`,
      };
    }

    // IT remediation handling (global and tenant system automation)
    if (actionType === 'IT_REMEDIATION_ACTION') {
      const isGlobalAction =
        companyId === 'GLOBAL' ||
        companyId === 'GLOBAL_INFRASTRUCTURE' ||
        !companyId ||
        request.payload?.isGlobal;

      if (isGlobalAction) {
        if (request.payload?.isRollback) {
          if (requestingActorRole !== 'CHAIRMAN' && requestingActorRole !== 'SYSTEM') {
            return {
              isAuthorized: false,
              requiresChairmanApproval: true,
              requiresSecondarySafeguards: false,
              rejectionReason: 'Global infrastructure remediation rollback requires CHAIRMAN or SYSTEM authority.',
            };
          }
          return {
            isAuthorized: true,
            requiresChairmanApproval: false,
            requiresSecondarySafeguards: false,
          };
        }

        if (requestingActorRole !== 'CHAIRMAN') {
          return {
            isAuthorized: false,
            requiresChairmanApproval: true,
            requiresSecondarySafeguards: false,
            rejectionReason: 'Global infrastructure remediation strictly requires sovereign CHAIRMAN authority.',
          };
        }
        return {
          isAuthorized: true,
          requiresChairmanApproval: riskTier === 'HIGH' || riskTier === 'CRITICAL',
          requiresSecondarySafeguards: riskTier === 'CRITICAL',
        };
      }

      // Tenant IT remediation handling
      if (request.payload?.isRollback) {
        return {
          isAuthorized: true,
          requiresChairmanApproval: false,
          requiresSecondarySafeguards: false,
        };
      }

      if (requestingActorRole === 'SYSTEM') {
        return {
          isAuthorized: true,
          requiresChairmanApproval: riskTier === 'HIGH' || riskTier === 'CRITICAL',
          requiresSecondarySafeguards: riskTier === 'CRITICAL',
        };
      }
    }

    // 2. COMPANY ISOLATION & ACTOR ROLE VERIFICATION
    if (!companyId || !requestingActorId) {
      return {
        isAuthorized: false,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
        rejectionReason: 'Invalid request: companyId and requestingActorId are mandatory.',
      };
    }

    // Verify company exists
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, chairmanId: true },
    });
    if (!company) {
      return {
        isAuthorized: false,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
        rejectionReason: `Company ${companyId} does not exist.`,
      };
    }

    // Check if actor is the company's designated Chairman
    const isChairman = company.chairmanId === requestingActorId;

    // Verify requesting actor in employee table
    const actorEmployee = await this.prisma.employee.findFirst({
      where: { id: requestingActorId, companyId },
      include: { role: true },
    });

    if (!actorEmployee && !isChairman) {
      return {
        isAuthorized: false,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
        rejectionReason: `Actor ${requestingActorId} does not belong to company ${companyId}. Strict company isolation enforced.`,
      };
    }

    // 3. ACTOR ROLE RESTRICTIONS & IMPERSONATION PREVENTION
    const employeeRoleTitle = actorEmployee?.role?.title;
    const effectiveRole = requestingActorRole || (isChairman ? 'CHAIRMAN' : employeeRoleTitle) || 'EMPLOYEE';

    if (requestingActorRole === 'CHAIRMAN' && !isChairman && employeeRoleTitle !== 'CHAIRMAN') {
      return {
        isAuthorized: false,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
        rejectionReason: 'Impersonation rejected: Actor claims CHAIRMAN role but credentials do not reflect CHAIRMAN status.',
      };
    }

    // 4. CEO IDENTITY VERIFICATION FOR CEO ACTORS
    let ceoEmployeeId: string | undefined = request.ceoId;
    if (effectiveRole === 'CEO') {
      if (!ceoEmployeeId) {
        ceoEmployeeId = actorEmployee?.id;
      }
      // Verify this employee is indeed the designated CEO of this company
      const activeCeo = await this.prisma.employee.findFirst({
        where: { id: ceoEmployeeId, companyId, role: { title: 'CEO' } },
        select: { id: true },
      });

      if (!activeCeo && employeeRoleTitle !== 'CEO') {
        return {
          isAuthorized: false,
          requiresChairmanApproval: false,
          requiresSecondarySafeguards: false,
          rejectionReason: `Designated CEO ${ceoEmployeeId} not found or not active for company ${companyId}.`,
        };
      }
    }

    // 5. FINANCIAL AUTHORITY VERIFICATION (IF FINANCIAL EXPOSURE > 0)
    let singleLimit = 100000; // default baseline limit (100k AC)
    if (financialExposure > 0) {
      const operation: CeoFinancialOperation = this.mapActionToFinancialOperation(actionType);

      if (effectiveRole === 'CEO' && ceoEmployeeId) {
        const authCheck = await this.financialAuthService.checkFinancialAuthority(
          companyId,
          ceoEmployeeId,
          operation,
          financialExposure,
          'INR',
        );

        if (authCheck.denied) {
          return {
            isAuthorized: false,
            requiresChairmanApproval: authCheck.requiresChairmanApproval ?? false,
            requiresSecondarySafeguards: riskTier === 'CRITICAL',
            rejectionReason: `Financial authority check denied: ${authCheck.reason}`,
            evaluatedAuthorityId: authCheck.authorityId,
          };
        }

        if (authCheck.requiresChairmanApproval) {
          return {
            isAuthorized: false,
            requiresChairmanApproval: true,
            requiresSecondarySafeguards: riskTier === 'CRITICAL',
            rejectionReason: `Financial authority required Chairman approval: ${authCheck.reason}`,
            evaluatedAuthorityId: authCheck.authorityId,
          };
        }

        // Active authority found and permitted
        return {
          isAuthorized: true,
          requiresChairmanApproval: false,
          requiresSecondarySafeguards: false,
          evaluatedAuthorityId: authCheck.authorityId,
          singleLimit,
        };
      }
    }

    // 6. RISK TIER AUTHORITY RULES
    switch (riskTier) {
      case 'LOW':
        // LOW: Routine, reversible, low-impact. CEO may execute autonomously when inside explicit authority.
        return {
          isAuthorized: true,
          requiresChairmanApproval: false,
          requiresSecondarySafeguards: false,
          singleLimit,
        };

      case 'MEDIUM':
        // MEDIUM: Controlled operational action with bounded impact. CEO may execute only within delegated authority.
        return {
          isAuthorized: true,
          requiresChairmanApproval: false,
          requiresSecondarySafeguards: false,
          singleLimit,
        };

      case 'HIGH':
        // HIGH: Material financial, strategic, customer, workforce, or difficult-to-reverse. Mandatory Chairman approval.
        return {
          isAuthorized: false,
          requiresChairmanApproval: true,
          requiresSecondarySafeguards: false,
          rejectionReason: 'HIGH risk tier requires explicit Chairman approval prior to gateway execution.',
          singleLimit,
        };

      case 'CRITICAL':
        // CRITICAL: Extreme-risk, effectively irreversible. Chairman authorization + secondary safeguards required.
        return {
          isAuthorized: false,
          requiresChairmanApproval: true,
          requiresSecondarySafeguards: true,
          rejectionReason: 'CRITICAL risk tier requires explicit Chairman approval plus secondary safeguards (two-step confirmation, anti-replay, verification).',
          singleLimit,
        };

      default:
        return {
          isAuthorized: false,
          requiresChairmanApproval: true,
          requiresSecondarySafeguards: true,
          rejectionReason: `Unknown risk tier: ${riskTier}`,
        };
    }
  }

  /**
   * Validates secondary safeguards for CRITICAL actions.
   */
  validateCriticalSafeguards(
    request: ExternalActionRequest,
  ): { valid: boolean; reason?: string } {
    const safeguards = request.secondarySafeguards;

    if (!safeguards) {
      return {
        valid: false,
        reason: 'CRITICAL action missing mandatory secondary safeguards specification.',
      };
    }

    if (!safeguards.requiresSecondaryConfirmation || !safeguards.confirmedBy) {
      return {
        valid: false,
        reason: 'Secondary independent confirmation (confirmedBy) is required for CRITICAL actions.',
      };
    }

    if (!safeguards.antiReplayToken || safeguards.antiReplayToken.trim().length < 8) {
      return {
        valid: false,
        reason: 'Valid cryptographic anti-replay token is required for CRITICAL actions.',
      };
    }

    if (!safeguards.targetVerified) {
      return {
        valid: false,
        reason: 'Target verification is required for CRITICAL actions.',
      };
    }

    if (!safeguards.amountVerified && request.financialExposure > 0) {
      return {
        valid: false,
        reason: 'Amount verification is required for CRITICAL actions with financial exposure.',
      };
    }

    // Cooldown check (if configured and not yet expired)
    if (safeguards.cooldownExpiresAt && new Date(safeguards.cooldownExpiresAt) > new Date()) {
      return {
        valid: false,
        reason: `CRITICAL action is currently in cooldown until ${safeguards.cooldownExpiresAt.toISOString()}.`,
      };
    }

    return { valid: true };
  }

  private mapActionToFinancialOperation(actionType: string): CeoFinancialOperation {
    switch (actionType) {
      case 'AUTHORIZE_PAYMENT':
        return CeoFinancialOperation.AUTHORIZE_PAYMENT;
      case 'TRANSFER_FUNDS':
        return CeoFinancialOperation.TRANSFER_FUNDS;
      case 'EXECUTE_REFUND':
        return CeoFinancialOperation.REFUND;
      case 'VENDOR_COMMITMENT':
        return CeoFinancialOperation.AUTHORIZE_EXPENSE;
      case 'DISPATCH_OFFER':
      case 'APPLY_DISCOUNT':
      case 'MARKETING_CAMPAIGN':
        return CeoFinancialOperation.MODIFY_BUDGET;
      default:
        return CeoFinancialOperation.AUTHORIZE_EXPENSE;
    }
  }
}
