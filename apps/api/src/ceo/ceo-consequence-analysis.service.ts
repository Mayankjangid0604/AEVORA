import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseBrainService } from '../enterprise-brain/enterprise-brain.service';
import { SignificanceFilterService } from '../enterprise-brain/significance-filter.service';
import { CeoObjectiveDecompositionService } from './ceo-objective-decomposition.service';
import {
  ConsequenceDimension,
  ReversibilityLevel,
  ConsequenceSeverity,
  DirectConsequence,
  SecondOrderConsequence,
  DimensionScore,
  ScenarioType,
  ScenarioSimulationResult,
  AffectedEntitySummary,
  DependencyAnalysisItem,
  ConsequenceUncertaintyItem,
  StructuredConsequenceReport,
  ConsequenceAnalysisInput,
  ChairmanDecisionBrief,
  DisagreementConsequenceComparison,
} from './ceo-consequence.types';
import { CeoDecisionCategory, CeoDecisionRiskLevel, CeoDecisionConfidence } from '@prisma/client';

@Injectable()
export class CeoConsequenceAnalysisService {
  private readonly logger = new Logger(CeoConsequenceAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enterpriseBrain: EnterpriseBrainService,
    private readonly significanceFilter: SignificanceFilterService,
    private readonly objectiveDecomposition: CeoObjectiveDecompositionService,
  ) {}

  /**
   * Evaluates all 14 consequence dimensions for a material CEO decision using a deterministic-first
   * methodology grounded in PostgreSQL facts and Enterprise Brain derived state.
   */
  async analyzeConsequences(input: ConsequenceAnalysisInput): Promise<StructuredConsequenceReport> {
    const { companyId, ceoId } = input;
    this.logger.log(`[${companyId}] Running comprehensive 14-dimension consequence analysis for: ${input.triggerType}`);

    // 1. Sanitize untrusted input strings (prevent prompt injection or executable elevation)
    const sanitizedAction = this.significanceFilter.sanitizeUntrustedText(input.proposedAction, 'PROPOSED_ACTION');
    const _sanitizedSituation = input.situation
      ? this.significanceFilter.sanitizeUntrustedText(input.situation, 'DECISION_SITUATION')
      : { raw: '' };

    // 2. Load PostgreSQL Authoritative Facts
    const [
      wallet,
      budget,
      departments,
      kpis,
      risks,
      openInvoices,
      activeTasks,
      authority,
      _targetEntity,
    ] = await Promise.all([
      this.prisma.aCWallet.findFirst({ where: { companyId } }),
      this.prisma.companyBudget.findFirst({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.department.findMany({ where: { companyId }, include: { employees: true } }),
      this.prisma.companyKPI.findMany({ where: { companyId } }),
      this.prisma.companyRisk.findMany({ where: { companyId, status: 'IDENTIFIED' } }),
      this.prisma.invoice.aggregate({ where: { companyId, status: 'ISSUED' }, _sum: { total: true } }).catch(() => ({ _sum: { total: 0 } })),
      this.prisma.task.findMany({ where: { companyId, status: { in: ['READY', 'IN_PROGRESS', 'BLOCKED'] } } }),
      this.prisma.ceoFinancialAuthority.findFirst({ where: { companyId, ceoEmployeeId: ceoId, authorityStatus: 'ACTIVE' } }),
      input.targetEntityType && input.targetEntityId
        ? this.resolveTargetEntity(companyId, input.targetEntityType, input.targetEntityId)
        : null,
    ]);

    // 3. Load Enterprise Brain Derived State & Relationship Graph
    const brainState = await this.enterpriseBrain.getDerivedEnterpriseState(companyId);
    const relationshipGraph = await this.enterpriseBrain.getRelationshipGraph(companyId);

    // 4. Extract Deterministic Baseline Figures
    const liquidBalance = wallet?.balance ?? brainState.financial.acBalance ?? 0;
    const estimatedCost = Math.max(0, input.estimatedCost ?? 0);
    const singleLimit = authority?.singleTransactionLimit ?? 0;
    const _monthlyLimit = authority?.monthlyLimit ?? 0;
    const pendingReceivablesTotal = (openInvoices as any)._sum?.total ?? 0;
    const totalEmployees = brainState.workforce.totalEmployees || departments.reduce((acc, d) => acc + d.employees.length, 0);

    // 5. Evaluate the 14 Consequence Dimensions Deterministically
    const directConsequences: DirectConsequence[] = [];
    const dimensionScores: Record<ConsequenceDimension, DimensionScore> = {} as any;
    const positiveConsequences: string[] = [];
    const negativeConsequences: string[] = [];

    // --- DIMENSION 1: FINANCIAL_IMPACT ---
    const netCashAfter = liquidBalance - estimatedCost;
    const financialPolarity = estimatedCost > 0 ? 'NEGATIVE' : 'NEUTRAL';
    directConsequences.push({
      dimension: 'FINANCIAL_IMPACT',
      description: `Direct expenditure commitment of ${estimatedCost} AC. Projected liquid treasury drops from ${liquidBalance} to ${netCashAfter} AC.`,
      calculatedValue: -estimatedCost,
      unit: 'AC',
      polarity: financialPolarity,
      isDeterministic: true,
    });
    dimensionScores['FINANCIAL_IMPACT'] = {
      score: estimatedCost > 0 ? Math.min(100, Math.round((estimatedCost / Math.max(liquidBalance, 1)) * 100)) : 10,
      impact: financialPolarity,
      details: `Capital outflow: ${estimatedCost} AC. Treasury balance after action: ${netCashAfter} AC.`,
      isDeterministic: true,
    };
    if (estimatedCost > 0) negativeConsequences.push(`Depletes ${estimatedCost} AC from company treasury reserves.`);

    // --- DIMENSION 2: REVENUE_IMPACT ---
    let revenueDelta = 0;
    if (input.category === 'CUSTOMER' || (input.category as string) === 'SALES' || (input.category as string) === 'MARKETING') {
      // Estimate revenue lift based on open sales pipeline and current conversion rate
      const pipelineValue = brainState.salesPipeline.weightedValue || 100000;
      const convRate = brainState.salesPipeline.conversionRate || 0.15;
      revenueDelta = Math.round(pipelineValue * convRate * 0.2); // projected 20% acceleration
      positiveConsequences.push(`Projected top-line pipeline acceleration of +${revenueDelta} AC over next quarter.`);
    }
    directConsequences.push({
      dimension: 'REVENUE_IMPACT',
      description: revenueDelta > 0 ? `Expected revenue lift of +${revenueDelta} AC from accelerated pipeline conversion.` : `Neutral immediate top-line revenue variance.`,
      calculatedValue: revenueDelta,
      unit: 'AC',
      polarity: revenueDelta > 0 ? 'POSITIVE' : 'NEUTRAL',
      isDeterministic: true,
    });
    dimensionScores['REVENUE_IMPACT'] = {
      score: revenueDelta > 0 ? 75 : 30,
      impact: revenueDelta > 0 ? 'POSITIVE' : 'NEUTRAL',
      details: `Projected top-line revenue shift: ${revenueDelta > 0 ? `+${revenueDelta}` : '0'} AC.`,
      isDeterministic: true,
    };

    // --- DIMENSION 3: PROFIT_IMPACT ---
    const netProfitDelta = revenueDelta - estimatedCost;
    const profitPolarity = netProfitDelta > 0 ? 'POSITIVE' : netProfitDelta < 0 ? 'NEGATIVE' : 'NEUTRAL';
    directConsequences.push({
      dimension: 'PROFIT_IMPACT',
      description: `Net margin shift of ${netProfitDelta >= 0 ? `+${netProfitDelta}` : netProfitDelta} AC factoring immediate cost against projected revenue.`,
      calculatedValue: netProfitDelta,
      unit: 'AC',
      polarity: profitPolarity,
      isDeterministic: true,
    });
    dimensionScores['PROFIT_IMPACT'] = {
      score: Math.min(100, Math.max(10, Math.round(Math.abs(netProfitDelta) / 1000))),
      impact: profitPolarity,
      details: `Net profit contribution: ${netProfitDelta} AC.`,
      isDeterministic: true,
    };

    // --- DIMENSION 4: CASH_FLOW_IMPACT ---
    const runwayDaysBefore = liquidBalance > 0 ? Math.round(liquidBalance / 500) : 0; // standard nominal burn
    const runwayDaysAfter = netCashAfter > 0 ? Math.round(netCashAfter / 500) : 0;
    const runwayDelta = runwayDaysAfter - runwayDaysBefore;
    directConsequences.push({
      dimension: 'CASH_FLOW_IMPACT',
      description: `Immediate liquidity impact: treasury runway shift of ${runwayDelta} days (from ${runwayDaysBefore} to ${runwayDaysAfter} days). Pending receivables buffer: ${pendingReceivablesTotal} AC.`,
      calculatedValue: runwayDelta,
      unit: 'days',
      polarity: runwayDelta < 0 ? 'NEGATIVE' : 'NEUTRAL',
      isDeterministic: true,
    });
    dimensionScores['CASH_FLOW_IMPACT'] = {
      score: runwayDaysAfter < 30 ? 85 : 40,
      impact: runwayDelta < 0 ? 'NEGATIVE' : 'NEUTRAL',
      details: `Runway post-action: ${runwayDaysAfter} days. Pending receivables: ${pendingReceivablesTotal} AC.`,
      isDeterministic: true,
    };

    // --- DIMENSION 5: CUSTOMER_IMPACT ---
    const isCustomerFacing = input.category === 'CUSTOMER' || (input.category as string) === 'SALES' || (input.category as string) === 'MARKETING' || (input.targetEntityType === 'CUSTOMER');
    const customerPolarity = isCustomerFacing ? 'POSITIVE' : 'NEUTRAL';
    const customerDesc = isCustomerFacing
      ? `Strengthens engagement and response velocity for active leads (${brainState.salesPipeline.leadCount}) and customers.`
      : `Internal operational action with negligible immediate customer friction.`;
    directConsequences.push({
      dimension: 'CUSTOMER_IMPACT',
      description: customerDesc,
      polarity: customerPolarity,
      isDeterministic: true,
    });
    dimensionScores['CUSTOMER_IMPACT'] = {
      score: isCustomerFacing ? 70 : 20,
      impact: customerPolarity,
      details: customerDesc,
      isDeterministic: true,
    };
    if (isCustomerFacing) positiveConsequences.push('Enhances customer and pipeline conversion touchpoints.');

    // --- DIMENSION 6: EMPLOYEE_IMPACT ---
    const affectedDept = input.targetEntityType === 'DEPARTMENT' && input.targetEntityId
      ? departments.find(d => d.id === input.targetEntityId)
      : null;
    const deptHeadcount = affectedDept ? affectedDept.employees.length : totalEmployees;
    const employeeDesc = affectedDept
      ? `Directly impacts ${affectedDept.name} department (${deptHeadcount} employees). Workload and responsibility scope adjusted.`
      : `Company-wide workforce impact across ${departments.length} departments (${totalEmployees} total staff).`;
    directConsequences.push({
      dimension: 'EMPLOYEE_IMPACT',
      description: employeeDesc,
      calculatedValue: deptHeadcount,
      unit: 'employees',
      polarity: 'NEUTRAL',
      isDeterministic: true,
    });
    dimensionScores['EMPLOYEE_IMPACT'] = {
      score: affectedDept ? 60 : 30,
      impact: 'NEUTRAL',
      details: employeeDesc,
      isDeterministic: true,
    };

    // --- DIMENSION 7: OPERATIONAL_IMPACT ---
    const openTaskCount = activeTasks.length;
    const blockedCount = activeTasks.filter(t => t.status === 'BLOCKED').length;
    const operationalDesc = `Influences operational execution cadence. Active task pipeline: ${openTaskCount} items (${blockedCount} currently blocked).`;
    directConsequences.push({
      dimension: 'OPERATIONAL_IMPACT',
      description: operationalDesc,
      calculatedValue: openTaskCount,
      unit: 'tasks',
      polarity: blockedCount > 5 ? 'NEGATIVE' : 'POSITIVE',
      isDeterministic: true,
    });
    dimensionScores['OPERATIONAL_IMPACT'] = {
      score: blockedCount > 0 ? 65 : 40,
      impact: blockedCount > 5 ? 'NEGATIVE' : 'POSITIVE',
      details: operationalDesc,
      isDeterministic: true,
    };

    // --- DIMENSION 8: RESOURCE_IMPACT ---
    const resourceDesc = `Allocates corporate resources. Budget committed: ${estimatedCost} AC. Headcount utilization: ${brainState.workforce.capacityOccupancyRatio * 100}%.`;
    directConsequences.push({
      dimension: 'RESOURCE_IMPACT',
      description: resourceDesc,
      polarity: estimatedCost > 100000 ? 'NEGATIVE' : 'NEUTRAL',
      isDeterministic: true,
    });
    dimensionScores['RESOURCE_IMPACT'] = {
      score: Math.min(100, Math.round(brainState.workforce.capacityOccupancyRatio * 100)),
      impact: 'NEUTRAL',
      details: resourceDesc,
      isDeterministic: true,
    };

    // --- DIMENSION 9: KPI_IMPACT ---
    const laggingKpis = kpis.filter(k => k.status === 'AT_RISK' || k.status === 'CRITICAL' || (k.status as string) === 'BEHIND');
    const kpiDesc = laggingKpis.length > 0
      ? `Directly targets resolution for ${laggingKpis.length} lagging KPI(s): ${laggingKpis.map(k => k.name).slice(0, 3).join(', ')}.`
      : `Maintains operational parity across all ${kpis.length} active company KPIs.`;
    directConsequences.push({
      dimension: 'KPI_IMPACT',
      description: kpiDesc,
      polarity: laggingKpis.length > 0 ? 'POSITIVE' : 'NEUTRAL',
      isDeterministic: true,
    });
    dimensionScores['KPI_IMPACT'] = {
      score: laggingKpis.length > 0 ? 80 : 30,
      impact: laggingKpis.length > 0 ? 'POSITIVE' : 'NEUTRAL',
      details: kpiDesc,
      isDeterministic: true,
    };
    if (laggingKpis.length > 0) positiveConsequences.push(`Helps recover ${laggingKpis.length} lagging corporate KPI(s).`);

    // --- DIMENSION 10: STRATEGIC_OBJECTIVE_IMPACT ---
    const activeObjectives = brainState.strategicGoals.activeObjectives;
    const atRiskObjectives = brainState.strategicGoals.atRiskObjectives;
    const stratDesc = `Aligns with enterprise strategy. Enterprise active objectives: ${activeObjectives} (${atRiskObjectives} currently at risk).`;
    directConsequences.push({
      dimension: 'STRATEGIC_OBJECTIVE_IMPACT',
      description: stratDesc,
      polarity: 'POSITIVE',
      isDeterministic: true,
    });
    dimensionScores['STRATEGIC_OBJECTIVE_IMPACT'] = {
      score: atRiskObjectives > 0 ? 75 : 45,
      impact: 'POSITIVE',
      details: stratDesc,
      isDeterministic: true,
    };
    positiveConsequences.push('Supports primary enterprise strategic milestone achievement.');

    // --- DIMENSION 11: RISK_IMPACT ---
    const criticalRisks = risks.filter(r => r.impact === 'CRITICAL');
    const isCriticalRiskAction = input.riskLevel === 'CRITICAL' || criticalRisks.length > 0;
    const riskPolarity = isCriticalRiskAction ? 'NEGATIVE' : 'NEUTRAL';
    const riskDesc = `Assesses corporate risk exposure. Unmitigated risks: ${risks.length} (${criticalRisks.length} CRITICAL). Decision intrinsic risk: ${input.riskLevel ?? 'LOW'}.`;
    directConsequences.push({
      dimension: 'RISK_IMPACT',
      description: riskDesc,
      polarity: riskPolarity,
      isDeterministic: true,
    });
    dimensionScores['RISK_IMPACT'] = {
      score: isCriticalRiskAction ? 85 : 35,
      impact: riskPolarity,
      details: riskDesc,
      isDeterministic: true,
    };
    if (isCriticalRiskAction) negativeConsequences.push(`Action operates in high/critical corporate risk environment.`);

    // --- DIMENSION 12: COMPLIANCE_IMPACT ---
    const exceedsLimit = singleLimit > 0 && estimatedCost > singleLimit;
    const complianceDesc = exceedsLimit
      ? `EXCEEDS CEO single expenditure limit of ${singleLimit} AC. Mandatory Chairman escalation required under V16 governance.`
      : `Within CEO autonomous operational mandate. Governance check passed.`;
    directConsequences.push({
      dimension: 'COMPLIANCE_IMPACT',
      description: complianceDesc,
      polarity: exceedsLimit ? 'NEGATIVE' : 'POSITIVE',
      isDeterministic: true,
    });
    dimensionScores['COMPLIANCE_IMPACT'] = {
      score: exceedsLimit ? 95 : 20,
      impact: exceedsLimit ? 'NEGATIVE' : 'POSITIVE',
      details: complianceDesc,
      isDeterministic: true,
    };
    if (exceedsLimit) negativeConsequences.push(`Violates autonomous financial threshold (${estimatedCost} > ${singleLimit} AC); requires Chairman approval.`);

    // --- DIMENSION 13: REPUTATION_IMPACT ---
    const repPolarity = exceedsLimit || input.riskLevel === 'CRITICAL' ? 'NEGATIVE' : 'POSITIVE';
    const repDesc = repPolarity === 'NEGATIVE'
      ? `Potential governance or performance scrutiny if cost or execution fails.`
      : `Reinforces proactive leadership and operational stability across executive team.`;
    directConsequences.push({
      dimension: 'REPUTATION_IMPACT',
      description: repDesc,
      polarity: repPolarity,
      isDeterministic: true,
    });
    dimensionScores['REPUTATION_IMPACT'] = {
      score: repPolarity === 'NEGATIVE' ? 70 : 30,
      impact: repPolarity,
      details: repDesc,
      isDeterministic: true,
    };

    // --- DIMENSION 14: TIME_DEPENDENCY_IMPACT ---
    const timeDeltaDays = estimatedCost > 100000 ? 7 : 2;
    const timeDesc = `Execution window: estimated ${timeDeltaDays} days to full operational stabilization and downstream synchronization.`;
    directConsequences.push({
      dimension: 'TIME_DEPENDENCY_IMPACT',
      description: timeDesc,
      calculatedValue: timeDeltaDays,
      unit: 'days',
      polarity: 'NEUTRAL',
      isDeterministic: true,
    });
    dimensionScores['TIME_DEPENDENCY_IMPACT'] = {
      score: timeDeltaDays > 5 ? 60 : 25,
      impact: 'NEUTRAL',
      details: timeDesc,
      isDeterministic: true,
    };

    // 6. Trace Second-Order Consequences (Cascading Effects)
    const secondOrderConsequences: SecondOrderConsequence[] = [];

    // Chain A: Financial Outflow -> Department Budget Depletion -> Capacity Friction -> Task Delays
    if (estimatedCost > 50000) {
      secondOrderConsequences.push({
        triggerEffect: `Financial commitment of ${estimatedCost} AC`,
        downstreamDimension: 'OPERATIONAL_IMPACT',
        downstreamEffect: 'Reduces available discretionary budget for departmental tooling, risking secondary task delays.',
        tracePath: [
          'Immediate Treasury Outflow',
          'Operating Budget Reservation',
          'Department Discretionary Squeeze',
          'Downstream Task SLA Delay',
        ],
        probability: 'MEDIUM',
        severity: estimatedCost > singleLimit ? 'HIGH' : 'MEDIUM',
      });
    }

    // Chain B: Resource/Staffing Shift -> Department Velocity Change -> KPI Degradation
    if (affectedDept) {
      secondOrderConsequences.push({
        triggerEffect: `Focus shift in ${affectedDept.name}`,
        downstreamDimension: 'KPI_IMPACT',
        downstreamEffect: `Temporary distraction from routine deliverables may cause transient dip in departmental throughput KPI.`,
        tracePath: [
          `Targeted Intervention: ${affectedDept.name}`,
          'Workforce Context Switching',
          'Slight Delivery Velocity Slowdown',
          'Departmental KPI Variance',
        ],
        probability: 'LOW',
        severity: 'LOW',
      });
    }

    // Chain C: Risk Escalation -> Strategic Objective at Risk -> Downstream Revenue/Valuation Impact
    if (input.riskLevel === 'CRITICAL' || isCriticalRiskAction) {
      secondOrderConsequences.push({
        triggerEffect: 'Critical operational or market risk exposure',
        downstreamDimension: 'STRATEGIC_OBJECTIVE_IMPACT',
        downstreamEffect: 'Unmitigated risk could block root strategic objective milestone, cascading into delayed annual revenue targets.',
        tracePath: [
          'Critical Risk Trigger',
          'Operational Bottleneck',
          'Strategic Milestone Miss',
          'Quarterly Revenue Shortfall',
        ],
        probability: 'HIGH',
        severity: 'CRITICAL',
      });
    }

    // 7. Dependency Analysis via Enterprise Brain Relationship Graph
    const dependencies: DependencyAnalysisItem[] = [];
    if (input.targetEntityId) {
      const graphEdges = relationshipGraph.edges.filter(
        e => e.from === input.targetEntityId || e.to === input.targetEntityId
      );
      for (const edge of graphEdges) {
        dependencies.push({
          entityId: edge.to === input.targetEntityId ? edge.from : edge.to,
          entityType: 'CONNECTED_ENTITY',
          dependencyType: edge.type,
          status: 'LINKED_GRAPH_DEPENDENCY',
          isCriticalPath: edge.type === 'DEPENDS_ON' || edge.type === 'SERVES_OBJECTIVE',
        });
      }
    }

    // 8. Identify Affected Entities
    const affectedEntities: AffectedEntitySummary[] = [];
    if (affectedDept) {
      affectedEntities.push({
        id: affectedDept.id,
        type: 'DEPARTMENT',
        name: affectedDept.name,
        impactDescription: `Primary execution department (${affectedDept.employees.length} employees).`,
        severity: 'MEDIUM',
      });
    }
    if (wallet) {
      affectedEntities.push({
        id: wallet.id,
        type: 'AC_WALLET',
        name: 'Corporate Treasury Wallet',
        impactDescription: `Balance adjusted by -${estimatedCost} AC.`,
        severity: estimatedCost > singleLimit ? 'HIGH' : 'LOW',
      });
    }

    // 9. Preserve Unresolved Enterprise Brain Discrepancies & Uncertainties
    const uncertainties: ConsequenceUncertaintyItem[] = [];
    if (brainState.conflictsDetected && brainState.conflictsDetected.length > 0) {
      for (const conflict of brainState.conflictsDetected) {
        uncertainties.push({
          description: `Discrepancy detected in domain ${conflict.domain}: primary source '${conflict.primarySource}' (${conflict.primaryValue}) vs secondary '${conflict.secondarySource}' (${conflict.secondaryValue}).`,
          source: conflict.primarySource,
          isDiscrepancy: true,
          confidenceImpact: -20,
        });
      }
    }
    if (brainState.unresolvedUncertainties && brainState.unresolvedUncertainties.length > 0) {
      for (const unc of brainState.unresolvedUncertainties) {
        uncertainties.push({
          description: unc,
          source: 'ENTERPRISE_BRAIN',
          isDiscrepancy: false,
          confidenceImpact: -10,
        });
      }
    }

    // 10. Reversibility Classification
    const reversibility = this.determineReversibility(input.category, input.proposedAction, estimatedCost);

    // 11. Consequence Severity Classification
    const overallSeverity = this.determineSeverity({
      estimatedCost,
      singleLimit,
      riskLevel: input.riskLevel,
      reversibility,
      exceedsLimit,
      uncertaintyCount: uncertainties.length,
    });

    // 12. Recommended Mitigation Strategies
    const recommendedMitigation: string[] = [];
    if (estimatedCost > 0) {
      recommendedMitigation.push(`Enforce milestone-gated payment tranches rather than lump-sum upfront disbursement.`);
    }
    if (input.riskLevel === 'CRITICAL' || isCriticalRiskAction) {
      recommendedMitigation.push(`Implement daily executive standup monitoring with automated rollback criteria.`);
    }
    if (uncertainties.length > 0) {
      recommendedMitigation.push(`Conduct manual ledger reconciliation for conflicting sources before secondary tranche release.`);
    }
    if (reversibility === 'DIFFICULT_TO_REVERSE' || reversibility === 'EFFECTIVELY_IRREVERSIBLE') {
      recommendedMitigation.push(`Obtain explicit Command MD / Chairman signoff and legal review before contract execution.`);
    }

    // 13. Determine Confidence Level (Adjusted downwards by unresolved discrepancies)
    let confidence: CeoDecisionConfidence = 'HIGH';
    if (uncertainties.some(u => u.isDiscrepancy)) {
      confidence = 'MEDIUM';
    }
    if (uncertainties.length > 3 || (input.riskLevel === 'CRITICAL' && estimatedCost > singleLimit)) {
      confidence = 'LOW';
    }

    // 14. Optional Scenario Simulation
    let scenarios: Record<ScenarioType, ScenarioSimulationResult> | undefined;
    if (input.includeSimulation !== false) {
      scenarios = await this.simulateScenariosInternal({
        companyId,
        proposedCost: estimatedCost,
        proposedAction: sanitizedAction.raw,
        directConsequences,
        secondOrderConsequences,
        liquidBalance,
        risksCount: risks.length,
        uncertainties,
      });
    }

    return {
      decisionId: input.decisionId,
      decisionSummary: {
        triggerType: input.triggerType,
        category: input.category,
        proposedAction: sanitizedAction.raw,
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId,
        estimatedCost,
      },
      assumptions: input.assumptions ?? [
        'Authoritative PostgreSQL ledger reflects true available liquidity.',
        'Enterprise Brain derived relations reflect verified operational links.',
      ],
      evidence: {
        liquidBalance,
        budgetAllocated: budget?.totalAmount ?? 0,
        singleTransactionLimit: singleLimit,
        activeTasksCount: activeTasks.length,
        activeDepartmentsCount: departments.length,
        leadCount: brainState.salesPipeline.leadCount,
      },
      affectedEntities,
      positiveConsequences,
      negativeConsequences,
      directConsequences,
      secondOrderConsequences,
      dependencies,
      risks: risks.map(r => ({
        title: r.title,
        severity: r.impact as CeoDecisionRiskLevel,
        probability: 'MEDIUM',
        mitigation: typeof r.mitigation === 'string' ? r.mitigation : (r.mitigation ? JSON.stringify(r.mitigation) : 'Standard executive oversight.'),
      })),
      uncertainties,
      reversibility,
      confidence,
      recommendedMitigation,
      overallSeverity,
      dimensionScores,
      scenarios,
      generatedAt: new Date(),
    };
  }

  /**
   * Internal scenario simulator: constructs Proposed, Alternative, and No-Action (baseline) scenarios.
   * Clearly distinguishes known facts, calculated consequences, assumptions, estimated outcomes, and uncertainties.
   */
  private async simulateScenariosInternal(params: {
    companyId: string;
    proposedCost: number;
    proposedAction: string;
    directConsequences: DirectConsequence[];
    secondOrderConsequences: SecondOrderConsequence[];
    liquidBalance: number;
    risksCount: number;
    uncertainties: ConsequenceUncertaintyItem[];
  }): Promise<Record<ScenarioType, ScenarioSimulationResult>> {
    const { proposedCost, proposedAction, liquidBalance, risksCount, uncertainties } = params;

    // SCENARIO 1: PROPOSED DECISION
    const proposedScenario: ScenarioSimulationResult = {
      scenario: 'PROPOSED',
      title: 'Execute Proposed Decision',
      description: proposedAction,
      knownFacts: {
        startingBalance: liquidBalance,
        committedOutflow: proposedCost,
        endingBalance: liquidBalance - proposedCost,
      },
      calculatedConsequences: params.directConsequences,
      secondOrderConsequences: params.secondOrderConsequences,
      assumptions: ['Execution completes within planned timeline.', 'Vendors/workers deliver to specification.'],
      estimatedProbabilisticOutcomes: [
        { outcome: 'Full Operational Target Achieved', probability: 0.85, expectedImpact: 'Positive strategic progress.' },
        { outcome: 'Minor SLA Delay', probability: 0.15, expectedImpact: 'Requires minor task reprioritization.' },
      ],
      unresolvedUncertainties: uncertainties.map(u => ({
        description: u.description,
        source: u.source,
        isDiscrepancy: u.isDiscrepancy,
      })),
      financialNetImpact: -proposedCost,
      riskScoreDelta: -10, // Proactively addressing issues lowers corporate risk
      projectedTimelineDeltaDays: 0,
    };

    // SCENARIO 2: ALTERNATIVE DECISION (Phased Deployment / 50% Capital Release)
    const alternativeCost = Math.round(proposedCost * 0.5);
    const alternativeScenario: ScenarioSimulationResult = {
      scenario: 'ALTERNATIVE',
      title: 'Phased Conservative Deployment (Two Tranches)',
      description: `Release 50% capital (${alternativeCost} AC) in Tranche 1. Release Tranche 2 only after operational milestones are validated.`,
      knownFacts: {
        startingBalance: liquidBalance,
        tranche1Cost: alternativeCost,
        tranche2Cost: alternativeCost,
        interimBalance: liquidBalance - alternativeCost,
      },
      calculatedConsequences: [
        {
          dimension: 'FINANCIAL_IMPACT',
          description: `Caps immediate cash commitment to ${alternativeCost} AC, preserving 50% liquidity buffer.`,
          calculatedValue: -alternativeCost,
          unit: 'AC',
          polarity: 'POSITIVE',
          isDeterministic: true,
        },
        {
          dimension: 'RISK_IMPACT',
          description: 'Drastically lowers capital loss risk if operational assumptions fail.',
          polarity: 'POSITIVE',
          isDeterministic: true,
        },
      ],
      secondOrderConsequences: [
        {
          triggerEffect: 'Tranche gating',
          downstreamDimension: 'TIME_DEPENDENCY_IMPACT',
          downstreamEffect: 'Extends total completion timeline by 10 business days while waiting for Tranche 1 milestone audit.',
          tracePath: ['Phase Gating', 'Interim Milestone Audit', 'Tranche 2 Authorization', 'Completion'],
          probability: 'HIGH',
          severity: 'LOW',
        },
      ],
      assumptions: ['Milestone criteria can be measured deterministically after Tranche 1.'],
      estimatedProbabilisticOutcomes: [
        { outcome: 'Phased Validation Success', probability: 0.90, expectedImpact: 'Lower downside risk with minor schedule extension.' },
      ],
      unresolvedUncertainties: uncertainties.map(u => ({
        description: u.description,
        source: u.source,
        isDiscrepancy: u.isDiscrepancy,
      })),
      financialNetImpact: -alternativeCost,
      riskScoreDelta: -25, // Lower downside risk
      projectedTimelineDeltaDays: 10,
    };

    // SCENARIO 3: NO_ACTION / BASELINE
    const noActionScenario: ScenarioSimulationResult = {
      scenario: 'NO_ACTION',
      title: 'No-Action Baseline (Status Quo Maintenance)',
      description: 'Take no active intervention. Maintain current operating schedule and monitor organically.',
      knownFacts: {
        startingBalance: liquidBalance,
        immediateOutflow: 0,
        unmitigatedRisks: risksCount,
      },
      calculatedConsequences: [
        {
          dimension: 'FINANCIAL_IMPACT',
          description: 'Zero immediate cash commitment. Treasury balance remains unaffected in short term.',
          calculatedValue: 0,
          unit: 'AC',
          polarity: 'NEUTRAL',
          isDeterministic: true,
        },
        {
          dimension: 'OPERATIONAL_IMPACT',
          description: 'Identified problem or bottleneck remains unaddressed, continuing to drag down team velocity.',
          polarity: 'NEGATIVE',
          isDeterministic: true,
        },
        {
          dimension: 'RISK_IMPACT',
          description: 'Unmitigated risks compound over time, potentially escalating to critical executive friction.',
          polarity: 'NEGATIVE',
          isDeterministic: true,
        },
      ],
      secondOrderConsequences: [
        {
          triggerEffect: 'Unaddressed Operational Drag',
          downstreamDimension: 'REVENUE_IMPACT',
          downstreamEffect: 'Accumulated delays eventually degrade client delivery and reduce follow-on renewal revenue.',
          tracePath: ['Inaction', 'Persistent Bottleneck', 'SLA Breach', 'Client Churn / Revenue Dip'],
          probability: 'HIGH',
          severity: 'HIGH',
        },
      ],
      assumptions: ['Internal teams can tolerate ongoing friction without catastrophic failure.'],
      estimatedProbabilisticOutcomes: [
        { outcome: 'Bottleneck Compounds', probability: 0.70, expectedImpact: 'Higher remediation cost later.' },
        { outcome: 'Organic Self-Resolution', probability: 0.30, expectedImpact: 'Issue subsides without management intervention.' },
      ],
      unresolvedUncertainties: uncertainties.map(u => ({
        description: u.description,
        source: u.source,
        isDiscrepancy: u.isDiscrepancy,
      })),
      financialNetImpact: 0,
      riskScoreDelta: +20, // Inaction increases risk over time
      projectedTimelineDeltaDays: 20,
    };

    return {
      PROPOSED: proposedScenario,
      ALTERNATIVE: alternativeScenario,
      NO_ACTION: noActionScenario,
    };
  }

  /**
   * Deterministically classifies the reversibility of a proposed action into 4 explicit levels.
   */
  determineReversibility(category: CeoDecisionCategory, proposedAction: string, cost: number): ReversibilityLevel {
    const actionLower = proposedAction.toLowerCase();

    // 1. EFFECTIVELY_IRREVERSIBLE: Permanent resource loss, company restructuring, termination, public equity
    if (
      actionLower.includes('terminate') ||
      actionLower.includes('fire') ||
      actionLower.includes('dissolve') ||
      actionLower.includes('divest') ||
      actionLower.includes('equity') ||
      actionLower.includes('grant_authority')
    ) {
      return 'EFFECTIVELY_IRREVERSIBLE';
    }

    // 2. DIFFICULT_TO_REVERSE: Long-term external contracts, large capital deployment (>500k), department overhaul
    if (
      actionLower.includes('contract') ||
      actionLower.includes('lease') ||
      actionLower.includes('hire') ||
      actionLower.includes('restructure') ||
      cost > 500000
    ) {
      return 'DIFFICULT_TO_REVERSE';
    }

    // 3. PARTIALLY_REVERSIBLE: Budget reallocations, campaign launches, project milestone adjustments
    if (
      category === 'FINANCE' ||
      category === 'CUSTOMER' ||
      (category as string) === 'MARKETING' ||
      actionLower.includes('reallocate') ||
      actionLower.includes('launch') ||
      cost > 25000
    ) {
      return 'PARTIALLY_REVERSIBLE';
    }

    // 4. REVERSIBLE: Standard operational task assignments, priority changes, software config
    return 'REVERSIBLE';
  }

  /**
   * Deterministically classifies consequence severity into LOW, MEDIUM, HIGH, or CRITICAL.
   */
  determineSeverity(params: {
    estimatedCost: number;
    singleLimit: number;
    riskLevel?: CeoDecisionRiskLevel;
    reversibility: ReversibilityLevel;
    exceedsLimit: boolean;
    uncertaintyCount: number;
  }): ConsequenceSeverity {
    // CRITICAL: Exceeds financial authority, CRITICAL risk level, or effectively irreversible
    if (
      params.exceedsLimit ||
      params.riskLevel === 'CRITICAL' ||
      params.reversibility === 'EFFECTIVELY_IRREVERSIBLE'
    ) {
      return 'CRITICAL';
    }

    // HIGH: Large cost (> 50% limit), difficult to reverse, or multiple conflicting data sources
    if (
      (params.singleLimit > 0 && params.estimatedCost > params.singleLimit * 0.5) ||
      params.reversibility === 'DIFFICULT_TO_REVERSE' ||
      params.riskLevel === 'HIGH' ||
      params.uncertaintyCount >= 3
    ) {
      return 'HIGH';
    }

    // MEDIUM: Moderate cost (> 10% limit) or partially reversible
    if (
      (params.singleLimit > 0 && params.estimatedCost > params.singleLimit * 0.1) ||
      params.reversibility === 'PARTIALLY_REVERSIBLE' ||
      params.riskLevel === 'MEDIUM'
    ) {
      return 'MEDIUM';
    }

    // LOW: Reversible operational action
    return 'LOW';
  }

  /**
   * Helper to resolve target entity metadata from PostgreSQL.
   */
  private async resolveTargetEntity(companyId: string, entityType: string, entityId: string) {
    if (entityType === 'DEPARTMENT') {
      return this.prisma.department.findFirst({ where: { id: entityId, companyId } });
    }
    if (entityType === 'EMPLOYEE') {
      return this.prisma.employee.findFirst({ where: { id: entityId, companyId } });
    }
    if (entityType === 'TASK') {
      return this.prisma.task.findFirst({ where: { id: entityId, companyId } });
    }
    if (entityType === 'OBJECTIVE') {
      return this.prisma.companyObjective.findFirst({ where: { id: entityId, companyId } });
    }
    return null;
  }

  /**
   * Generates a structured Chairman Decision Brief consuming the complete consequence-analysis report.
   */
  async generateChairmanDecisionBrief(companyId: string, decisionId: string): Promise<ChairmanDecisionBrief> {
    const decision = await this.prisma.ceoAutonomousDecision.findFirst({
      where: { id: decisionId, companyId },
    });
    if (!decision) {
      throw new NotFoundException(`Decision ${decisionId} not found in company ${companyId}`);
    }

    const report = await this.analyzeConsequences({
      companyId,
      ceoId: decision.ceoId,
      decisionId: decision.id,
      triggerType: decision.triggerType,
      category: decision.category,
      proposedAction: decision.proposedAction,
      situation: decision.situation,
      targetEntityType: decision.targetEntityType ?? undefined,
      targetEntityId: decision.targetEntityId ?? undefined,
      riskLevel: decision.riskLevel,
      isReversible: decision.reversible,
      includeSimulation: true,
    });

    const isHighOrCritical = report.overallSeverity === 'HIGH' || report.overallSeverity === 'CRITICAL';
    const escalationReason = isHighOrCritical
      ? `Decision consequence severity classified as ${report.overallSeverity}. Reversibility: ${report.reversibility}. Requires Chairman authorization.`
      : 'Standard informational executive brief.';

    return {
      decisionId,
      companyId,
      briefTitle: `Executive Brief: ${decision.triggerType} — ${report.overallSeverity} Severity`,
      executiveSummary: `The CEO has evaluated decision '${decision.proposedAction}' across all 14 enterprise consequence dimensions. Overall severity: ${report.overallSeverity}, Reversibility: ${report.reversibility}.`,
      decisionSubject: decision.triggerType,
      proposer: `CEO (${decision.ceoId})`,
      consequenceAnalysis: report,
      scenarioComparison: {
        proposed: report.scenarios!.PROPOSED,
        alternative: report.scenarios!.ALTERNATIVE,
        noAction: report.scenarios!.NO_ACTION,
      },
      recommendedAction: report.overallSeverity === 'CRITICAL'
        ? 'Escalate to Chairman with recommendation for Phased Conservative Deployment (Alternative Scenario).'
        : `Proceed with proposed action '${decision.proposedAction}' subject to standard mitigation gates.`,
      escalationReason,
      requiresChairmanApproval: decision.requiresApproval || isHighOrCritical,
      generatedAt: new Date(),
    };
  }

  /**
   * Generates a 3-way consequence comparison for the Chairman Disagreement protocol (Requirement 18 / 28):
   * Compares Directive Consequences vs CEO Recommended Alternative vs No-Action Baseline.
   */
  async compareDisagreementConsequences(
    companyId: string,
    ceoId: string,
    directiveText: string,
    ceoAlternativeText: string,
  ): Promise<DisagreementConsequenceComparison> {
    const sanitizedDirective = this.significanceFilter.sanitizeUntrustedText(directiveText, 'DIRECTIVE');
    const sanitizedAlternative = this.significanceFilter.sanitizeUntrustedText(ceoAlternativeText, 'CEO_ALTERNATIVE');

    // 1. Analyze Directive Consequences
    const directiveConsequences = await this.analyzeConsequences({
      companyId,
      ceoId,
      triggerType: 'CHAIRMAN_DIRECTIVE_EVALUATION',
      category: 'OPERATIONS',
      proposedAction: sanitizedDirective.raw,
      includeSimulation: false,
    });

    // 2. Analyze CEO Alternative Consequences
    const ceoAlternativeConsequences = await this.analyzeConsequences({
      companyId,
      ceoId,
      triggerType: 'CEO_RECOMMENDED_ALTERNATIVE',
      category: 'OPERATIONS',
      proposedAction: sanitizedAlternative.raw,
      includeSimulation: false,
    });

    // 3. Construct No-Action Baseline
    const baselineScenarios = await this.simulateScenariosInternal({
      companyId,
      proposedCost: 0,
      proposedAction: 'No action taken',
      directConsequences: [],
      secondOrderConsequences: [],
      liquidBalance: directiveConsequences.evidence.liquidBalance ?? 100000,
      risksCount: directiveConsequences.risks.length,
      uncertainties: directiveConsequences.uncertainties,
    });

    return {
      directive: sanitizedDirective.raw,
      ceoPov: `The CEO has conducted consequence analysis comparing the Chairman directive against a mitigated operational alternative. Directive severity is ${directiveConsequences.overallSeverity}, while CEO alternative severity is ${ceoAlternativeConsequences.overallSeverity}.`,
      supportingEvidence: [
        `Directive estimated financial outflow: ${directiveConsequences.decisionSummary.estimatedCost} AC.`,
        `Liquid treasury balance: ${directiveConsequences.evidence.liquidBalance} AC.`,
        `Alternative net impact: ${ceoAlternativeConsequences.decisionSummary.estimatedCost} AC.`,
      ],
      consequenceComparison: {
        directiveConsequences,
        ceoAlternativeConsequences,
        noActionBaseline: baselineScenarios.NO_ACTION,
      },
      alternatives: [
        {
          option: sanitizedAlternative.raw,
          rationale: 'Mitigates immediate liquidity strain and implements phased verification tranches.',
          consequenceSummary: `Severity: ${ceoAlternativeConsequences.overallSeverity}, Reversibility: ${ceoAlternativeConsequences.reversibility}.`,
        },
      ],
      risks: directiveConsequences.risks.map(r => ({
        title: r.title,
        severity: r.severity,
        probability: r.probability,
      })),
      recommendation: ceoAlternativeConsequences.overallSeverity === 'CRITICAL'
        ? 'Re-evaluate strategic premise before capital allocation.'
        : 'Adopt the CEO recommended phased alternative to preserve capital while achieving strategic intent.',
      decisionAuthority: 'CHAIRMAN',
    };
  }
}
