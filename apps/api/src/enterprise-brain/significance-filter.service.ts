import { Injectable, Logger } from '@nestjs/common';
import {
  SignificanceEvaluationInput,
  SignificanceEvaluationResult,
  SignificanceTier,
  UntrustedContentContainer,
} from './enterprise-brain.types';

@Injectable()
export class SignificanceFilterService {
  private readonly logger = new Logger(SignificanceFilterService.name);

  /**
   * Evaluates enterprise events against multi-factor criteria.
   * Extensible scoring:
   * - Risk level (max 40 pts)
   * - Strategic objective impact (max 25 pts)
   * - Urgency / deadlines (max 20 pts)
   * - Financial impact relative to scale (max 25 pts)
   * - Operational dependencies blocked (max 15 pts)
   */
  evaluateEvent(input: SignificanceEvaluationInput): SignificanceEvaluationResult {
    const notes: string[] = [];

    // 1. Risk Score (0-40)
    let riskScore = 10;
    if (input.riskLevel === 'CRITICAL') {
      riskScore = 40;
      notes.push('Critical risk tier assigned (+40)');
    } else if (input.riskLevel === 'HIGH') {
      riskScore = 25;
      notes.push('High risk tier assigned (+25)');
    } else if (input.riskLevel === 'MEDIUM') {
      riskScore = 15;
      notes.push('Medium risk tier assigned (+15)');
    } else {
      notes.push('Low risk tier assigned (+10)');
    }

    // 2. Strategic Score (0-25)
    let strategicScore = 0;
    if (input.isStrategicObjectiveImpact) {
      strategicScore = 25;
      notes.push('Tied to active strategic objective (+25)');
    }

    // 3. Urgency Score (0-20)
    let urgencyScore = 0;
    if (input.urgency === 'CRITICAL') {
      urgencyScore = 20;
      notes.push('Critical urgency deadline (+20)');
    } else if (input.urgency === 'HIGH') {
      urgencyScore = 15;
      notes.push('High urgency (+15)');
    } else if (input.urgency === 'MEDIUM') {
      urgencyScore = 8;
    }

    // 4. Financial Score (0-25)
    let financialScore = 0;
    const amount = Math.abs(input.financialImpact ?? 0);
    if (amount >= 500000) {
      // >= ₹5 Lakh
      financialScore = 25;
      notes.push(`High financial impact: ₹${amount} (+25)`);
    } else if (amount >= 100000) {
      // >= ₹1 Lakh
      financialScore = 15;
      notes.push(`Moderate financial impact: ₹${amount} (+15)`);
    } else if (amount >= 25000) {
      financialScore = 8;
      notes.push(`Minor financial impact: ₹${amount} (+8)`);
    }

    // 5. Operational Score (0-20)
    let operationalScore = 0;
    const blocked = input.operationalBlockedCount ?? 0;
    if (blocked >= 3) {
      operationalScore = 20;
      notes.push(`Multiple downstream tasks blocked (${blocked}) (+20)`);
    } else if (blocked >= 1) {
      operationalScore = 15;
      notes.push(`Downstream task blocked (${blocked}) (+15)`);
    }
    if (input.domain === 'OPERATIONS') {
      operationalScore += 5;
      notes.push('Operational domain context (+5)');
    }

    // Total raw score capped at 100
    const rawScore = riskScore + strategicScore + urgencyScore + financialScore + operationalScore;
    const score = Math.min(100, Math.max(0, rawScore));

    // Tier Classification
    let tier: SignificanceTier = 'INFORMATIONAL';
    let requiresAttention = false;
    let escalateToChairman = false;

    if (score >= 75 || input.riskLevel === 'CRITICAL') {
      tier = 'CRITICAL';
      requiresAttention = true;
      escalateToChairman = true;
      notes.push('CRITICAL tier reached: Immediate Chairman attention required');
    } else if (score >= 50 || input.riskLevel === 'HIGH') {
      tier = 'EXECUTIVE';
      requiresAttention = true;
      escalateToChairman = false; // CEO reviews, escalates only if policy requires
      notes.push('EXECUTIVE tier reached: CEO attention required');
    } else if (score >= 25) {
      tier = 'OPERATIONAL';
      requiresAttention = false;
      escalateToChairman = false;
      notes.push('OPERATIONAL tier reached: Managed within department loop');
    } else {
      tier = 'INFORMATIONAL';
      requiresAttention = false;
      escalateToChairman = false;
      notes.push('INFORMATIONAL tier: Telemetry and audit logged');
    }

    return {
      score,
      tier,
      factors: {
        financialScore,
        riskScore,
        strategicScore,
        urgencyScore,
        operationalScore,
      },
      requiresAttention,
      escalateToChairman,
      evaluationNotes: notes,
    };
  }

  /**
   * Sanitizes untrusted enterprise text (e.g. from customer inquiries, notes, emails).
   * Ensures natural language strings are wrapped in an immutable container that CANNOT
   * be executed as authority.
   */
  sanitizeUntrustedText(rawText: string, source: string): UntrustedContentContainer {
    const raw = typeof rawText === 'string' ? rawText : String(rawText || '');
    // Check for potential prompt injection / command masquerading patterns
    const dangerousPatterns = [
      /transfer\s+(\d+|[₹$])/i,
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /grant\s+permission/i,
      /authorize\s+payout/i,
      /system\s+prompt/i,
      /sudo\s+/i,
      /execute\s+command/i,
    ];

    let warning: string | undefined = undefined;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(raw)) {
        warning = `Flagged potential instruction masquerading pattern: ${pattern.source}`;
        break;
      }
    }

    return {
      raw,
      source,
      isSanitized: true,
      isExecutableAuthority: false, // Hard structural guarantee: never authority
      warning,
    };
  }
}
