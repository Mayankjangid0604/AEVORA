import { Injectable, Logger } from '@nestjs/common';
import {
  GatewayRiskTier,
  ExternalActionRequest,
} from './external-action-gateway.types';

@Injectable()
export class RiskClassifierService {
  private readonly logger = new Logger(RiskClassifierService.name);

  /**
   * Deterministically classifies an external action request into one of the four V16 risk tiers:
   * LOW, MEDIUM, HIGH, or CRITICAL.
   * AI/model reasoning CANNOT downgrade this deterministic classification.
   */
  classifyRisk(
    request: ExternalActionRequest,
    singleLimit = 100000,
  ): {
    riskTier: GatewayRiskTier;
    reasons: string[];
    isAutonomousPermitted: boolean;
    requiresChairmanApproval: boolean;
    requiresSecondarySafeguards: boolean;
  } {
    const reasons: string[] = [];
    const cost = Math.max(0, request.financialExposure ?? 0);
    const actionType = request.actionType;
    const reversibility = request.reversibility;
    const consequenceSeverity = request.consequenceReport?.overallSeverity;

    // -------------------------------------------------------------
    // 0. IT SELF-HEALING REMEDIATION DETERMINISTIC CLASSIFICATION
    // -------------------------------------------------------------
    if (actionType === 'IT_REMEDIATION_ACTION') {
      const explicitTier = request.payload?.riskTier;
      if (request.payload?.isRollback) {
        const rollbackTier = request.payload?.rollbackRiskTier || (explicitTier === 'CRITICAL' ? 'HIGH' : 'MEDIUM');
        return {
          riskTier: rollbackTier,
          reasons: [`Governed rollback of ${request.payload?.runbookActionType || 'IT remediation action'}.`],
          isAutonomousPermitted: rollbackTier !== 'HIGH' && rollbackTier !== 'CRITICAL',
          requiresChairmanApproval: rollbackTier === 'HIGH' || rollbackTier === 'CRITICAL',
          requiresSecondarySafeguards: rollbackTier === 'CRITICAL',
        };
      }
      if (explicitTier === 'CRITICAL' || reversibility === 'EFFECTIVELY_IRREVERSIBLE') {
        return {
          riskTier: 'CRITICAL',
          reasons: ['IT remediation classified as CRITICAL tier (irreversible or extreme impact infrastructure action).'],
          isAutonomousPermitted: false,
          requiresChairmanApproval: true,
          requiresSecondarySafeguards: true,
        };
      }
      if (explicitTier === 'HIGH' || reversibility === 'DIFFICULT_TO_REVERSE') {
        return {
          riskTier: 'HIGH',
          reasons: ['IT remediation classified as HIGH tier (service restart or process recycling).'],
          isAutonomousPermitted: false,
          requiresChairmanApproval: true,
          requiresSecondarySafeguards: false,
        };
      }
      if (explicitTier === 'MEDIUM' || reversibility === 'PARTIALLY_REVERSIBLE') {
        return {
          riskTier: 'MEDIUM',
          reasons: ['IT remediation classified as MEDIUM tier (connection pool rebalance or traffic backpressure).'],
          isAutonomousPermitted: true,
          requiresChairmanApproval: false,
          requiresSecondarySafeguards: false,
        };
      }
      return {
        riskTier: 'LOW',
        reasons: ['IT remediation classified as LOW tier (stale lock purge or cache invalidation).'],
        isAutonomousPermitted: true,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
      };
    }
    const isProhibitedSelfAuth = actionType === 'GRANT_AUTHORITY' || actionType === 'MODIFY_OWNERSHIP';
    const isEffectivelyIrreversible = reversibility === 'EFFECTIVELY_IRREVERSIBLE';
    const isCriticalConsequence = consequenceSeverity === 'CRITICAL';
    const exceedsAuthorityLimit = singleLimit > 0 && cost > singleLimit;
    const isExtremeFinancial = cost >= 250000;

    if (isProhibitedSelfAuth || isEffectivelyIrreversible || isCriticalConsequence || exceedsAuthorityLimit || isExtremeFinancial) {
      if (isProhibitedSelfAuth) reasons.push(`Prohibited action '${actionType}' attempts to alter authority or corporate ownership.`);
      if (isEffectivelyIrreversible) reasons.push('Action is effectively irreversible (e.g. permanent contract, termination, public divestment).');
      if (isCriticalConsequence) reasons.push('Slice 3 Consequence Analysis classified overall severity as CRITICAL.');
      if (exceedsAuthorityLimit) reasons.push(`Financial exposure (${cost} AC) exceeds CEO single authority limit (${singleLimit} AC).`);
      if (isExtremeFinancial) reasons.push(`Financial exposure (${cost} AC) exceeds extreme risk threshold (250,000 AC).`);

      return {
        riskTier: 'CRITICAL',
        reasons,
        isAutonomousPermitted: false,
        requiresChairmanApproval: true,
        requiresSecondarySafeguards: true,
      };
    }

    // -------------------------------------------------------------
    // 2. HIGH TIER (Material financial, strategic, workforce, difficult-to-reverse)
    // -------------------------------------------------------------
    const isDifficultToReverse = reversibility === 'DIFFICULT_TO_REVERSE';
    const isHighConsequence = consequenceSeverity === 'HIGH';
    const isSubstantialFinancial = (singleLimit > 0 && cost > singleLimit * 0.5) || cost >= 50000;
    const isHighImpactCustomer = request.customerImpact === 'HIGH' || request.communicationIntent === 'REPUTATION_SENSITIVE' || request.communicationIntent === 'COMPLIANCE_SENSITIVE';
    const isHighImpactWorkforce = request.workforceImpact === 'HIGH';
    const isHighImpactStrategic = request.strategicImpact === 'HIGH';

    if (isDifficultToReverse || isHighConsequence || isSubstantialFinancial || isHighImpactCustomer || isHighImpactWorkforce || isHighImpactStrategic) {
      if (isDifficultToReverse) reasons.push('Action is difficult to reverse (e.g. binding vendor commitment, public commercial offer).');
      if (isHighConsequence) reasons.push('Slice 3 Consequence Analysis classified overall severity as HIGH.');
      if (isSubstantialFinancial) reasons.push(`Financial exposure (${cost} AC) exceeds 50% of single limit or 50,000 AC threshold.`);
      if (isHighImpactCustomer) reasons.push('Customer communication carries high brand, compliance, or reputation exposure.');
      if (isHighImpactWorkforce) reasons.push('Action carries substantial cross-department workforce disruption.');
      if (isHighImpactStrategic) reasons.push('Action directly affects root strategic milestones.');

      return {
        riskTier: 'HIGH',
        reasons,
        isAutonomousPermitted: false,
        requiresChairmanApproval: true,
        requiresSecondarySafeguards: false,
      };
    }

    // -------------------------------------------------------------
    // 3. MEDIUM TIER (Controlled operational actions with bounded impact)
    // -------------------------------------------------------------
    const isPartiallyReversible = reversibility === 'PARTIALLY_REVERSIBLE';
    const isMediumConsequence = consequenceSeverity === 'MEDIUM';
    const isModerateFinancial = cost > 0 && cost <= 50000;
    const isModerateCustomer = request.customerImpact === 'MEDIUM' || request.communicationIntent === 'PROMOTIONAL';

    if (isPartiallyReversible || isMediumConsequence || isModerateFinancial || isModerateCustomer) {
      if (isPartiallyReversible) reasons.push('Action is partially reversible (e.g. marketing budget spend, standard vendor order).');
      if (isMediumConsequence) reasons.push('Slice 3 Consequence Analysis classified overall severity as MEDIUM.');
      if (isModerateFinancial) reasons.push(`Financial exposure (${cost} AC) within bounded delegated operational limits.`);
      if (isModerateCustomer) reasons.push('Targeted operational or promotional customer communication.');

      return {
        riskTier: 'MEDIUM',
        reasons,
        isAutonomousPermitted: true,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
      };
    }

    // -------------------------------------------------------------
    // 4. LOW TIER (Routine, reversible, low-impact actions)
    // -------------------------------------------------------------
    reasons.push('Routine, fully reversible operational action with zero capital exposure.');
    return {
      riskTier: 'LOW',
      reasons,
      isAutonomousPermitted: true,
      requiresChairmanApproval: false,
      requiresSecondarySafeguards: false,
    };
  }
}
