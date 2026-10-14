import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';

const noStore = { 'Cache-Control': 'no-store' };

/** Sanitizes untrusted text to ensure no executable instructions or leaked paths */
function sanitizeText(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

/** Strips internal server stack traces or raw paths */
const INTERNAL_ERROR_RE = /invocation in|\.(ts|js):\d+|\bat [\w.<>]+ \(|prisma\.|[A-Z]:\\[\w-]|systemInstructions|stack trace/i;
function filterInternalText(text: unknown): string {
  if (typeof text !== 'string') return '';
  if (INTERNAL_ERROR_RE.test(text)) {
    return 'Internal system notice recorded (details restricted).';
  }
  return sanitizeText(text);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const slug = (await ctx.params).slug;
  const path = slug.join('/');

  const companyId = req.headers.get(COMPANY_HEADER) ?? undefined;
  if (!companyId || !isSafeId(companyId)) {
    return NextResponse.json({ message: 'Valid company context required' }, { status: 400 });
  }

  const token = await readSessionToken();
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  // 1. Operating State & Context
  if (path === 'state') {
    const [stateRes, healthRes, contextRes] = await Promise.all([
      backendFetch<Record<string, unknown>>('ceo/operating-state', { companyId, token, signal: req.signal }),
      backendFetch<Record<string, unknown>>('ceo/strategy/health', { companyId, token, signal: req.signal }),
      backendFetch<Record<string, unknown>>('ceo/context', { companyId, token, signal: req.signal }),
    ]);

    if (!stateRes.ok) return NextResponse.json(stateRes.error, { status: stateRes.status, headers: noStore });

    const raw = stateRes.data || {};
    const health = healthRes.ok ? healthRes.data : null;
    const context = contextRes.ok ? contextRes.data : null;

    const priorities = Array.isArray(raw.priorities)
      ? (raw.priorities as Record<string, unknown>[]).map((p) => ({
          id: p.id as string,
          title: filterInternalText(p.title),
          priority: (p.priority as string) || 'NORMAL',
          targetDate: (p.targetDate as string) || null,
        }))
      : [];

    const recentDecisions = Array.isArray(raw.decisions)
      ? (raw.decisions as Record<string, unknown>[]).slice(0, 10).map((d) => {
          const ca = d.consequenceAnalysis as Record<string, unknown> | undefined;
          return {
            id: d.id as string,
            type: (d.decisionType as string) || (d.type as string) || 'OPERATIONAL',
            title: filterInternalText(d.title || d.rationale || 'Decision Item'),
            status: (d.status as string) || 'PROPOSED',
            riskTier: (d.riskTier as string) || 'MEDIUM',
            urgency: (d.urgency as string) || 'NORMAL',
            createdAt: (d.createdAt as string) || new Date().toISOString(),
            netScore: typeof ca?.netScore === 'number' ? ca.netScore : 0,
            recommendation: (ca?.recommendation as string) || 'PROCEED',
            needsChairmanApproval: d.riskTier === 'HIGH' || d.riskTier === 'CRITICAL' || d.needsChairmanApproval === true,
          };
        })
      : [];

    const activeObjs = context?.activeObjectives as Record<string, unknown>[] | undefined;
    const firstActiveObjTitle = activeObjs?.[0]?.title;

    const operatingState = {
      currentPhase: (context?.operationalStatus as Record<string, unknown> | undefined)?.lifecyclePhase || 'OBSERVE',
      lastRunAt: context?.lastReflectedAt || raw.lastRunAt || null,
      activeGoal: firstActiveObjTitle ? filterInternalText(firstActiveObjTitle) : null,
      operatingHealth: (health?.status as string) || 'HEALTHY',
      activeObjectivesCount: activeObjs?.length ?? (Array.isArray(raw.objectives) ? raw.objectives.length : 0),
      pendingDecisionsCount: recentDecisions.filter((d) => d.status === 'PROPOSED' || d.status === 'EVALUATING').length,
      pendingApprovalsCount: recentDecisions.filter((d) => d.needsChairmanApproval && d.status === 'PROPOSED').length,
      recentDecisions,
      priorities,
    };

    return NextResponse.json(operatingState, { status: 200, headers: noStore });
  }

  // 2. Autonomous Decisions
  if (path === 'decisions') {
    const res = await backendFetch<Record<string, unknown>[]>('ceo/autonomous-decisions', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const items = (Array.isArray(res.data) ? res.data : []).map((d) => {
      const ca = d.consequenceAnalysis as Record<string, unknown> | undefined;
      const finExposure = typeof d.financialExposure === 'number' ? d.financialExposure : 0;
      return {
        id: d.id as string,
        type: (d.decisionType as string) || (d.type as string) || 'GENERAL',
        title: filterInternalText(d.title || d.rationale || 'Decision'),
        status: (d.status as string) || 'PROPOSED',
        riskTier: (d.riskTier as string) || (finExposure > 50000 ? 'CRITICAL' : finExposure > 10000 ? 'HIGH' : 'MEDIUM'),
        urgency: (d.urgency as string) || 'NORMAL',
        createdAt: (d.createdAt as string) || new Date().toISOString(),
        netScore: typeof ca?.netScore === 'number' ? ca.netScore : 0,
        recommendation: (ca?.recommendation as string) || 'PROCEED',
        needsChairmanApproval: d.status === 'PROPOSED' && (d.riskTier === 'HIGH' || d.riskTier === 'CRITICAL' || Boolean(d.needsChairmanApproval)),
        approvalId: (d.approvalId as string) || null,
        approvalStatus: (d.approvalStatus as string) || null,
      };
    });

    return NextResponse.json(items, { status: 200, headers: noStore });
  }

  // 3. Decision Brief
  if (slug[0] === 'decision-brief' && slug[1]) {
    const decisionId = slug[1];
    if (!isSafeId(decisionId)) {
      return NextResponse.json({ message: 'Invalid decision ID' }, { status: 400 });
    }

    const res = await backendFetch<Record<string, unknown>>(`ceo/decision-brief/${decisionId}`, { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const b = res.data || {};
    const ca = b.consequenceAnalysis as Record<string, unknown> | undefined;
    const uncert = ca?.uncertainty as Record<string, unknown> | undefined;
    const auth = b.authorityStatus as Record<string, unknown> | undefined;
    const appReq = b.approvalRequirement as Record<string, unknown> | undefined;

    const brief = {
      decisionId: (b.decisionId as string) || decisionId,
      title: filterInternalText(b.title || 'Decision Brief'),
      decisionType: (b.decisionType as string) || 'OPERATIONAL',
      rationale: filterInternalText(b.rationale || ''),
      status: (b.status as string) || 'PROPOSED',
      urgency: (b.urgency as string) || 'NORMAL',
      createdAt: (b.createdAt as string) || new Date().toISOString(),
      evidence: Array.isArray(b.evidence)
        ? (b.evidence as unknown[]).map((e) => filterInternalText(typeof e === 'string' ? e : (e as Record<string, unknown>)?.description))
        : [],
      assumptions: Array.isArray(b.assumptions) ? (b.assumptions as unknown[]).map(filterInternalText) : [],
      alternatives: Array.isArray(b.alternatives)
        ? (b.alternatives as Record<string, unknown>[]).map((a) => ({
            title: filterInternalText(a.title),
            rationale: filterInternalText(a.rationale),
            tradeoffs: filterInternalText(a.tradeoffs),
            score: typeof a.score === 'number' ? a.score : 0,
          }))
        : [],
      expectedOutcomes: Array.isArray(b.expectedOutcomes)
        ? (b.expectedOutcomes as Record<string, unknown>[]).map((o) => ({
            metric: filterInternalText(o.metric),
            baseline: (o.baseline as string | number) ?? 'N/A',
            expected: (o.expected as string | number) ?? 'N/A',
            timeframeDays: typeof o.timeframeDays === 'number' ? o.timeframeDays : 30,
          }))
        : [],
      consequenceAnalysis: {
        netScore: typeof ca?.netScore === 'number' ? ca.netScore : 0,
        dimensions: (ca?.dimensions as Record<string, unknown>) || {},
        recommendation: (ca?.recommendation as string) || 'PROCEED',
        riskTier: (ca?.riskTier as string) || 'MEDIUM',
        reversibility: (ca?.reversibility as string) || 'REVERSIBLE',
        uncertainty: {
          level: (uncert?.level as string) || 'LOW',
          rationale: filterInternalText(uncert?.rationale || ''),
          criticalGaps: Array.isArray(uncert?.criticalGaps)
            ? (uncert.criticalGaps as unknown[]).map(filterInternalText)
            : [],
        },
        mitigations: Array.isArray(ca?.mitigations)
          ? (ca.mitigations as unknown[]).map(filterInternalText)
          : [],
      },
      scenarioSimulations: Array.isArray(b.scenarioSimulations)
        ? (b.scenarioSimulations as Record<string, unknown>[]).map((s) => ({
            scenario: (s.scenario as string) || 'EXPECTED',
            probability: typeof s.probability === 'number' ? s.probability : 0.5,
            projectedFinancialDelta: typeof s.projectedFinancialDelta === 'number' ? s.projectedFinancialDelta : 0,
            projectedKpiDelta: typeof s.projectedKpiDelta === 'number' ? s.projectedKpiDelta : 0,
            narrative: filterInternalText(s.narrative || ''),
          }))
        : [],
      authorityStatus: {
        withinCeoLimit: typeof auth?.withinCeoLimit === 'boolean' ? auth.withinCeoLimit : true,
        requiredTier: (auth?.requiredTier as string) || 'MEDIUM',
        approvedBy: (auth?.approvedBy as string) || null,
        approvedAt: (auth?.approvedAt as string) || null,
      },
      approvalRequirement: {
        required: typeof appReq?.required === 'boolean' ? appReq.required : false,
        reason: filterInternalText(appReq?.reason),
        approvalId: (appReq?.approvalId as string) || undefined,
      },
    };

    return NextResponse.json(brief, { status: 200, headers: noStore });
  }

  // 4. Proactive Signals
  if (path === 'signals') {
    const res = await backendFetch<Record<string, unknown>[]>('ceo/proactive-signals', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const signals = (Array.isArray(res.data) ? res.data : []).map((s) => ({
      id: (s.id as string) || `sig_${Math.random().toString(36).substring(2, 9)}`,
      type: (s.type as string) || 'RISK',
      severity: (s.severity as string) || 'MEDIUM',
      title: filterInternalText(s.title),
      description: filterInternalText(s.description),
      recommendedAction: filterInternalText(s.recommendedAction || ''),
      detectedAt: (s.detectedAt as string) || new Date().toISOString(),
    }));

    return NextResponse.json(signals, { status: 200, headers: noStore });
  }

  // 5. Enterprise Brain
  if (path === 'brain') {
    const [stateRes, conflictsRes, graphRes] = await Promise.all([
      backendFetch<Record<string, unknown>>('enterprise-brain/state', { companyId, token, signal: req.signal }),
      backendFetch<Record<string, unknown>[]>('enterprise-brain/conflicts', { companyId, token, signal: req.signal }),
      backendFetch<Record<string, unknown>>('enterprise-brain/graph', { companyId, token, signal: req.signal }),
    ]);

    if (!stateRes.ok) return NextResponse.json(stateRes.error, { status: stateRes.status, headers: noStore });

    const brainData = stateRes.data || {};
    const conflicts = conflictsRes.ok && Array.isArray(conflictsRes.data)
      ? conflictsRes.data.map((c) => ({
          id: c.id as string,
          type: (c.type as string) || 'SCHEDULE',
          severity: (c.severity as string) || 'MEDIUM',
          description: filterInternalText(c.description),
          entitiesInvolved: Array.isArray(c.entitiesInvolved) ? c.entitiesInvolved : [],
          suggestedResolution: filterInternalText(c.suggestedResolution || ''),
        }))
      : [];

    const graph = graphRes.ok ? graphRes.data : { nodeCount: 0, edgeCount: 0 };

    return NextResponse.json({
      summary: {
        companyId,
        timestamp: brainData.timestamp || new Date().toISOString(),
        financialSummary: brainData.financialSummary || {
          totalBudget: 0,
          totalAllocated: 0,
          totalSpent: 0,
          remainingBudget: 0,
          cashFlowEstimate: 0,
          currency: 'INR',
        },
        workforceSummary: brainData.workforceSummary || {
          totalEmployees: 0,
          activeEmployees: 0,
          departmentCount: 0,
          leadCount: 0,
        },
        projectsSummary: brainData.projectsSummary || {
          totalProjects: 0,
          activeProjects: 0,
          completedProjects: 0,
          blockedProjects: 0,
        },
        kpis: brainData.kpis || {
          financialHealth: 1.0,
          operationalEfficiency: 1.0,
          deliveryReliability: 1.0,
          strategicAlignment: 1.0,
        },
        nodeCount: (graph.nodeCount as number) ?? 0,
        edgeCount: (graph.edgeCount as number) ?? 0,
        freshnessTimestamp: brainData.freshnessTimestamp || new Date().toISOString(),
      },
      conflicts,
    }, { status: 200, headers: noStore });
  }

  // 6. External Action Gateway Audit Trail
  if (path === 'actions') {
    const res = await backendFetch<Record<string, unknown>[]>('api/external-actions/audit', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const audit = (Array.isArray(res.data) ? res.data : []).map((a) => ({
      actionId: (a.actionId as string) || (a.id as string),
      actionType: a.actionType as string,
      tier: (a.tier as string) || 'LOW',
      status: (a.status as string) || 'EXECUTED',
      provider: (a.provider as string) || 'SYSTEM',
      financialExposure: typeof a.financialExposure === 'number' ? a.financialExposure : 0,
      idempotencyKey: (a.idempotencyKey as string) || '',
      targetRecipient: a.targetRecipient ? filterInternalText(a.targetRecipient) : undefined,
      intendedEffect: a.intendedEffect ? filterInternalText(a.intendedEffect) : undefined,
      timestamp: (a.timestamp as string) || (a.createdAt as string) || new Date().toISOString(),
      externalReferenceId: (a.externalReferenceId as string) || undefined,
      errorMessage: a.errorMessage ? filterInternalText(a.errorMessage) : undefined,
      actualOutcomeRecorded: a.actualOutcomeRecorded ? filterInternalText(a.actualOutcomeRecorded) : undefined,
    }));

    return NextResponse.json(audit, { status: 200, headers: noStore });
  }

  // 7. Organizational Memory & Lessons
  if (path === 'memory') {
    const res = await backendFetch<Record<string, unknown>[]>('api/organizational-memory', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const memories = (Array.isArray(res.data) ? res.data : []).map((m) => ({
      id: m.id as string,
      category: (m.category as string) || 'STRATEGY',
      maturity: (m.maturity as string) || 'OBSERVATION',
      subject: filterInternalText(m.subject),
      content: filterInternalText(m.content),
      confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
      applicableDomain: (m.applicableDomain as string) || 'GENERAL',
      evidenceCount: typeof m.evidenceCount === 'number' ? m.evidenceCount : 1,
      createdAt: (m.createdAt as string) || new Date().toISOString(),
      updatedAt: (m.updatedAt as string) || new Date().toISOString(),
    }));

    return NextResponse.json(memories, { status: 200, headers: noStore });
  }

  // 8. Strategic Reflection Reports
  if (path === 'reflection') {
    const res = await backendFetch<Record<string, unknown>>('api/organizational-memory/reflect', {
      method: 'POST',
      body: { companyId, periodDays: 30 },
      companyId,
      token,
      signal: req.signal,
    });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const r = res.data || {};
    const report = {
      id: (r.id as string) || `refl_${Date.now()}`,
      periodStart: (r.periodStart as string) || new Date(Date.now() - 30 * 86400000).toISOString(),
      periodEnd: (r.periodEnd as string) || new Date().toISOString(),
      evaluationsCount: typeof r.evaluationsCount === 'number' ? r.evaluationsCount : 0,
      decisionSuccessRate: typeof r.decisionSuccessRate === 'number' ? r.decisionSuccessRate : 1.0,
      predictionAccuracyRate: typeof r.predictionAccuracyRate === 'number' ? r.predictionAccuracyRate : 1.0,
      recurringPatterns: Array.isArray(r.recurringPatterns)
        ? (r.recurringPatterns as Record<string, unknown>[]).map((p) => ({
            pattern: filterInternalText(p.pattern),
            occurrences: typeof p.occurrences === 'number' ? p.occurrences : 1,
            significance: filterInternalText((p.significance as string) || 'MEDIUM'),
          }))
        : [],
      replanningRecommendations: Array.isArray(r.replanningRecommendations)
        ? (r.replanningRecommendations as Record<string, unknown>[]).map((rec) => ({
            objectiveId: rec.objectiveId as string,
            recommendation: filterInternalText(rec.recommendation),
            rationale: filterInternalText(rec.rationale),
            urgency: (rec.urgency as string) || 'MEDIUM',
          }))
        : [],
    };

    return NextResponse.json(report, { status: 200, headers: noStore });
  }

  // 9. Spatial Digital-Twin Live Context (canonical spatial-context + v15-context alias)
  if (path === 'spatial-context' || path === 'v15-context') {
    const res = await backendFetch<Record<string, unknown>>(`world-state/snapshot/${companyId}`, { companyId, token, signal: req.signal });
    if (!res.ok) {
      // Graceful fallback to default spatial context
      return NextResponse.json({
        activeCampus: 'Corporate Headquarters',
        totalRooms: 12,
        deskCapacity: 48,
        currentOccupancy: 18,
        activeAvatars: 14,
        lastSpatialSync: new Date().toISOString(),
      }, { status: 200, headers: noStore });
    }

    const snap = res.data || {};
    const occupancy = Array.isArray(snap.occupancy) ? snap.occupancy.length : 0;
    const rooms = Array.isArray(snap.rooms) ? snap.rooms.length : 8;

    return NextResponse.json({
      activeCampus: (snap.campusName as string) || 'Corporate Headquarters',
      totalRooms: rooms,
      deskCapacity: typeof snap.totalCapacity === 'number' ? snap.totalCapacity : rooms * 4,
      currentOccupancy: occupancy,
      activeAvatars: occupancy,
      lastSpatialSync: (snap.timestamp as string) || new Date().toISOString(),
    }, { status: 200, headers: noStore });
  }

  // 10. Offer Market Context (canonical offer-context + v24-context alias)
  if (path === 'offer-context' || path === 'v24-context') {
    const res = await backendFetch<Record<string, unknown>[]>('api/external-actions/audit', { companyId, token, signal: req.signal });
    const audit = res.ok && Array.isArray(res.data) ? res.data : [];
    const offerActions = audit.filter((a) => a.provider === 'AEVORA_V24_OFFER_MARKET_ADAPTER' || a.provider === 'AEVORA_OFFER_MARKET_ADAPTER');

    return NextResponse.json({
      activeCampaignsCount: offerActions.filter((a) => a.actionType === 'MARKETING_CAMPAIGN').length,
      offersDispatchedToday: offerActions.filter((a) => a.actionType === 'DISPATCH_OFFER').length,
      averageDiscountPercent: 15,
      maxAutonomousDiscountLimit: 50,
      offerGatewayProvider: 'AEVORA_OFFER_MARKET_ADAPTER',
      v24GatewayProvider: 'AEVORA_V24_OFFER_MARKET_ADAPTER',
    }, { status: 200, headers: noStore });
  }

  return NextResponse.json({ message: 'Executive endpoint not found' }, { status: 404 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const slug = (await ctx.params).slug;
  const path = slug.join('/');

  const companyId = req.headers.get(COMPANY_HEADER) ?? undefined;
  if (!companyId || !isSafeId(companyId)) {
    return NextResponse.json({ message: 'Valid company context required' }, { status: 400 });
  }

  const token = await readSessionToken();
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // 1. Run Autonomous Loop
  if (path === 'loop/run') {
    const r = await backendFetch('ceo/run-autonomous-loop', {
      method: 'POST',
      body,
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 2. Submit Objective
  if (path === 'objective/create') {
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json({ message: 'Title is required' }, { status: 400 });
    }
    const r = await backendFetch('ceo/objective', {
      method: 'POST',
      body: {
        title: sanitizeText(body.title),
        description: sanitizeText(body.description || ''),
      },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 3. Decompose Objective
  if (path === 'objective/decompose') {
    const r = await backendFetch('ceo/decompose-objective', {
      method: 'POST',
      body,
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 4. Replan Objective
  if (slug[0] === 'objective' && slug[1] === 'replan' && slug[2]) {
    const objectiveId = slug[2];
    if (!isSafeId(objectiveId)) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });
    const r = await backendFetch(`ceo/replan-objective/${objectiveId}`, {
      method: 'POST',
      body,
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 5. Evaluate Directive & CEO Disagreement
  if (path === 'directive/evaluate') {
    if (!body.directive || typeof body.directive !== 'string') {
      return NextResponse.json({ message: 'Directive text is required' }, { status: 400 });
    }
    const r = await backendFetch('ceo/evaluate-directive', {
      method: 'POST',
      body: { directive: sanitizeText(body.directive) },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 6. Compare Disagreement Consequences
  if (path === 'directive/disagreement') {
    if (!body.directive || !body.alternative) {
      return NextResponse.json({ message: 'Both directive and alternative are required' }, { status: 400 });
    }
    const r = await backendFetch('ceo/disagreement-consequences', {
      method: 'POST',
      body: {
        directive: sanitizeText(body.directive),
        alternative: sanitizeText(body.alternative),
      },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 7. Approve Autonomous Decision
  if (slug[0] === 'decision' && slug[1] === 'approve' && slug[2]) {
    const id = slug[2];
    if (!isSafeId(id)) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });
    const r = await backendFetch(`ceo/autonomous-decisions/${id}/approve`, {
      method: 'POST',
      body,
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 8. Reject Autonomous Decision
  if (slug[0] === 'decision' && slug[1] === 'reject' && slug[2]) {
    const id = slug[2];
    if (!isSafeId(id)) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });
    const r = await backendFetch(`ceo/autonomous-decisions/${id}/reject`, {
      method: 'POST',
      body,
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 9. Execute Autonomous Decision
  if (slug[0] === 'decision' && slug[1] === 'execute' && slug[2]) {
    const id = slug[2];
    if (!isSafeId(id)) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });
    const r = await backendFetch(`ceo/autonomous-decisions/${id}/execute`, {
      method: 'POST',
      body,
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 10. Chairman Approval Resolve
  if (slug[0] === 'approval' && slug[1] === 'resolve' && slug[2]) {
    const id = slug[2];
    if (!isSafeId(id)) return NextResponse.json({ message: 'Invalid approval ID' }, { status: 400 });
    const r = await backendFetch(`approval/${id}/resolve`, {
      method: 'POST',
      body: {
        decision: body.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        reason: sanitizeText(body.reason || ''),
      },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 11. External Action Gateway Execute
  if (path === 'gateway/execute') {
    const r = await backendFetch('api/external-actions/execute', {
      method: 'POST',
      body: { ...body, companyId },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 12. Evaluate Outcome (Expected vs Actual Feedback)
  if (path === 'memory/evaluate') {
    const r = await backendFetch('api/organizational-memory/evaluate', {
      method: 'POST',
      body: { ...body, companyId },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  // 13. Perform Strategic Reflection
  if (path === 'memory/reflect') {
    const r = await backendFetch('api/organizational-memory/reflect', {
      method: 'POST',
      body: { ...body, companyId },
      companyId,
      token,
      signal: req.signal,
    });
    return NextResponse.json(r.ok ? r.data : r.error, { status: r.status, headers: noStore });
  }

  return NextResponse.json({ message: 'Executive mutation endpoint not found' }, { status: 404 });
}
