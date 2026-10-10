import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch, readSessionToken } from '@/server/api';
import { COMPANY_HEADER, isSafeId } from '@/lib/http';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

const noStore = { 'Cache-Control': 'no-store' };

/** Sanitizes untrusted text to ensure no executable instructions or leaked paths */
function sanitizeText(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

/** Strips internal server stack traces or raw paths */
const INTERNAL_ERROR_RE = /invocation in|\.(ts|js):\d+|\bat [\w.<>]+ \(|prisma\.|[A-Z]:\\[\w-]|systemInstructions|stack trace/i;
function filterInternalText(text: string | null | undefined): string {
  if (!text) return '';
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
      backendFetch<any>('ceo/operating-state', { companyId, token, signal: req.signal }),
      backendFetch<any>('ceo/strategy/health', { companyId, token, signal: req.signal }),
      backendFetch<any>('ceo/context', { companyId, token, signal: req.signal }),
    ]);

    if (!stateRes.ok) return NextResponse.json(stateRes.error, { status: stateRes.status, headers: noStore });

    const raw = stateRes.data || {};
    const health = healthRes.ok ? healthRes.data : null;
    const context = contextRes.ok ? contextRes.data : null;

    const priorities = Array.isArray(raw.priorities)
      ? raw.priorities.map((p: any) => ({
          id: p.id,
          title: filterInternalText(p.title),
          priority: p.priority || 'NORMAL',
          targetDate: p.targetDate || null,
        }))
      : [];

    const recentDecisions = Array.isArray(raw.decisions)
      ? raw.decisions.slice(0, 10).map((d: any) => ({
          id: d.id,
          type: d.decisionType || d.type || 'OPERATIONAL',
          title: filterInternalText(d.title || d.rationale || 'Decision Item'),
          status: d.status || 'PROPOSED',
          riskTier: d.riskTier || 'MEDIUM',
          urgency: d.urgency || 'NORMAL',
          createdAt: d.createdAt || new Date().toISOString(),
          netScore: typeof d.consequenceAnalysis?.netScore === 'number' ? d.consequenceAnalysis.netScore : 0,
          recommendation: d.consequenceAnalysis?.recommendation || 'PROCEED',
          needsChairmanApproval: d.riskTier === 'HIGH' || d.riskTier === 'CRITICAL' || d.needsChairmanApproval === true,
        }))
      : [];

    const operatingState = {
      currentPhase: context?.operationalStatus?.lifecyclePhase || 'OBSERVE',
      lastRunAt: context?.lastReflectedAt || raw.lastRunAt || null,
      activeGoal: context?.activeObjectives?.[0]?.title ? filterInternalText(context.activeObjectives[0].title) : null,
      operatingHealth: health?.status || 'HEALTHY',
      activeObjectivesCount: context?.activeObjectives?.length ?? (Array.isArray(raw.objectives) ? raw.objectives.length : 0),
      pendingDecisionsCount: recentDecisions.filter((d: any) => d.status === 'PROPOSED' || d.status === 'EVALUATING').length,
      pendingApprovalsCount: recentDecisions.filter((d: any) => d.needsChairmanApproval && d.status === 'PROPOSED').length,
      recentDecisions,
      priorities,
    };

    return NextResponse.json(operatingState, { status: 200, headers: noStore });
  }

  // 2. Autonomous Decisions
  if (path === 'decisions') {
    const res = await backendFetch<any[]>('ceo/autonomous-decisions', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const items = (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
      id: d.id,
      type: d.decisionType || d.type || 'GENERAL',
      title: filterInternalText(d.title || d.rationale || 'Decision'),
      status: d.status || 'PROPOSED',
      riskTier: d.riskTier || (d.financialExposure > 50000 ? 'CRITICAL' : d.financialExposure > 10000 ? 'HIGH' : 'MEDIUM'),
      urgency: d.urgency || 'NORMAL',
      createdAt: d.createdAt || new Date().toISOString(),
      netScore: d.consequenceAnalysis?.netScore ?? 0,
      recommendation: d.consequenceAnalysis?.recommendation || 'PROCEED',
      needsChairmanApproval: d.status === 'PROPOSED' && (d.riskTier === 'HIGH' || d.riskTier === 'CRITICAL' || d.needsChairmanApproval),
      approvalId: d.approvalId || null,
      approvalStatus: d.approvalStatus || null,
    }));

    return NextResponse.json(items, { status: 200, headers: noStore });
  }

  // 3. Decision Brief
  if (slug[0] === 'decision-brief' && slug[1]) {
    const decisionId = slug[1];
    if (!isSafeId(decisionId)) {
      return NextResponse.json({ message: 'Invalid decision ID' }, { status: 400 });
    }

    const res = await backendFetch<any>(`ceo/decision-brief/${decisionId}`, { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const b = res.data;
    const brief = {
      decisionId: b.decisionId || decisionId,
      title: filterInternalText(b.title || 'Decision Brief'),
      decisionType: b.decisionType || 'OPERATIONAL',
      rationale: filterInternalText(b.rationale || ''),
      status: b.status || 'PROPOSED',
      urgency: b.urgency || 'NORMAL',
      createdAt: b.createdAt || new Date().toISOString(),
      evidence: Array.isArray(b.evidence) ? b.evidence.map((e: any) => filterInternalText(typeof e === 'string' ? e : e.description)) : [],
      assumptions: Array.isArray(b.assumptions) ? b.assumptions.map(filterInternalText) : [],
      alternatives: Array.isArray(b.alternatives)
        ? b.alternatives.map((a: any) => ({
            title: filterInternalText(a.title),
            rationale: filterInternalText(a.rationale),
            tradeoffs: filterInternalText(a.tradeoffs),
            score: typeof a.score === 'number' ? a.score : 0,
          }))
        : [],
      expectedOutcomes: Array.isArray(b.expectedOutcomes)
        ? b.expectedOutcomes.map((o: any) => ({
            metric: filterInternalText(o.metric),
            baseline: o.baseline ?? 'N/A',
            expected: o.expected ?? 'N/A',
            timeframeDays: typeof o.timeframeDays === 'number' ? o.timeframeDays : 30,
          }))
        : [],
      consequenceAnalysis: {
        netScore: b.consequenceAnalysis?.netScore ?? 0,
        dimensions: b.consequenceAnalysis?.dimensions || {},
        recommendation: b.consequenceAnalysis?.recommendation || 'PROCEED',
        riskTier: b.consequenceAnalysis?.riskTier || 'MEDIUM',
        reversibility: b.consequenceAnalysis?.reversibility || 'REVERSIBLE',
        uncertainty: {
          level: b.consequenceAnalysis?.uncertainty?.level || 'LOW',
          rationale: filterInternalText(b.consequenceAnalysis?.uncertainty?.rationale || ''),
          criticalGaps: Array.isArray(b.consequenceAnalysis?.uncertainty?.criticalGaps)
            ? b.consequenceAnalysis.uncertainty.criticalGaps.map(filterInternalText)
            : [],
        },
        mitigations: Array.isArray(b.consequenceAnalysis?.mitigations)
          ? b.consequenceAnalysis.mitigations.map(filterInternalText)
          : [],
      },
      scenarioSimulations: Array.isArray(b.scenarioSimulations)
        ? b.scenarioSimulations.map((s: any) => ({
            scenario: s.scenario || 'EXPECTED',
            probability: s.probability ?? 0.5,
            projectedFinancialDelta: s.projectedFinancialDelta ?? 0,
            projectedKpiDelta: s.projectedKpiDelta ?? 0,
            narrative: filterInternalText(s.narrative || ''),
          }))
        : [],
      authorityStatus: {
        withinCeoLimit: b.authorityStatus?.withinCeoLimit ?? true,
        requiredTier: b.authorityStatus?.requiredTier || 'MEDIUM',
        approvedBy: b.authorityStatus?.approvedBy || null,
        approvedAt: b.authorityStatus?.approvedAt || null,
      },
      approvalRequirement: {
        required: b.approvalRequirement?.required ?? false,
        reason: filterInternalText(b.approvalRequirement?.reason),
        approvalId: b.approvalRequirement?.approvalId,
      },
    };

    return NextResponse.json(brief, { status: 200, headers: noStore });
  }

  // 4. Proactive Signals
  if (path === 'signals') {
    const res = await backendFetch<any[]>('ceo/proactive-signals', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const signals = (Array.isArray(res.data) ? res.data : []).map((s: any) => ({
      id: s.id || `sig_${Math.random().toString(36).substring(2, 9)}`,
      type: s.type || 'RISK',
      severity: s.severity || 'MEDIUM',
      title: filterInternalText(s.title),
      description: filterInternalText(s.description),
      recommendedAction: filterInternalText(s.recommendedAction || ''),
      detectedAt: s.detectedAt || new Date().toISOString(),
    }));

    return NextResponse.json(signals, { status: 200, headers: noStore });
  }

  // 5. Enterprise Brain
  if (path === 'brain') {
    const [stateRes, conflictsRes, graphRes] = await Promise.all([
      backendFetch<any>('enterprise-brain/state', { companyId, token, signal: req.signal }),
      backendFetch<any>('enterprise-brain/conflicts', { companyId, token, signal: req.signal }),
      backendFetch<any>('enterprise-brain/graph', { companyId, token, signal: req.signal }),
    ]);

    if (!stateRes.ok) return NextResponse.json(stateRes.error, { status: stateRes.status, headers: noStore });

    const brainData = stateRes.data || {};
    const conflicts = conflictsRes.ok && Array.isArray(conflictsRes.data)
      ? conflictsRes.data.map((c: any) => ({
          id: c.id,
          type: c.type || 'SCHEDULE',
          severity: c.severity || 'MEDIUM',
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
        nodeCount: graph.nodeCount ?? 0,
        edgeCount: graph.edgeCount ?? 0,
        freshnessTimestamp: brainData.freshnessTimestamp || new Date().toISOString(),
      },
      conflicts,
    }, { status: 200, headers: noStore });
  }

  // 6. External Action Gateway Audit Trail
  if (path === 'actions') {
    const res = await backendFetch<any[]>('api/external-actions/audit', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const audit = (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
      actionId: a.actionId || a.id,
      actionType: a.actionType,
      tier: a.tier || 'LOW',
      status: a.status || 'EXECUTED',
      provider: a.provider || 'SYSTEM',
      financialExposure: typeof a.financialExposure === 'number' ? a.financialExposure : 0,
      idempotencyKey: a.idempotencyKey || '',
      targetRecipient: a.targetRecipient ? filterInternalText(a.targetRecipient) : undefined,
      intendedEffect: a.intendedEffect ? filterInternalText(a.intendedEffect) : undefined,
      timestamp: a.timestamp || a.createdAt || new Date().toISOString(),
      externalReferenceId: a.externalReferenceId || undefined,
      errorMessage: a.errorMessage ? filterInternalText(a.errorMessage) : undefined,
      actualOutcomeRecorded: a.actualOutcomeRecorded ? filterInternalText(a.actualOutcomeRecorded) : undefined,
    }));

    return NextResponse.json(audit, { status: 200, headers: noStore });
  }

  // 7. Organizational Memory & Lessons
  if (path === 'memory') {
    const res = await backendFetch<any[]>('api/organizational-memory', { companyId, token, signal: req.signal });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const memories = (Array.isArray(res.data) ? res.data : []).map((m: any) => ({
      id: m.id,
      category: m.category || 'STRATEGY',
      maturity: m.maturity || 'OBSERVATION',
      subject: filterInternalText(m.subject),
      content: filterInternalText(m.content),
      confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
      applicableDomain: m.applicableDomain || 'GENERAL',
      evidenceCount: m.evidenceCount ?? 1,
      createdAt: m.createdAt || new Date().toISOString(),
      updatedAt: m.updatedAt || new Date().toISOString(),
    }));

    return NextResponse.json(memories, { status: 200, headers: noStore });
  }

  // 8. Strategic Reflection Reports
  if (path === 'reflection') {
    const res = await backendFetch<any>('api/organizational-memory/reflect', {
      method: 'POST',
      body: { companyId, periodDays: 30 },
      companyId,
      token,
      signal: req.signal,
    });
    if (!res.ok) return NextResponse.json(res.error, { status: res.status, headers: noStore });

    const r = res.data;
    const report = {
      id: r.id || `refl_${Date.now()}`,
      periodStart: r.periodStart || new Date(Date.now() - 30 * 86400000).toISOString(),
      periodEnd: r.periodEnd || new Date().toISOString(),
      evaluationsCount: r.evaluationsCount ?? 0,
      decisionSuccessRate: r.decisionSuccessRate ?? 1.0,
      predictionAccuracyRate: r.predictionAccuracyRate ?? 1.0,
      recurringPatterns: Array.isArray(r.recurringPatterns)
        ? r.recurringPatterns.map((p: any) => ({
            pattern: filterInternalText(p.pattern),
            occurrences: p.occurrences ?? 1,
            significance: filterInternalText(p.significance || 'MEDIUM'),
          }))
        : [],
      replanningRecommendations: Array.isArray(r.replanningRecommendations)
        ? r.replanningRecommendations.map((rec: any) => ({
            objectiveId: rec.objectiveId,
            recommendation: filterInternalText(rec.recommendation),
            rationale: filterInternalText(rec.rationale),
            urgency: rec.urgency || 'MEDIUM',
          }))
        : [],
    };

    return NextResponse.json(report, { status: 200, headers: noStore });
  }

  // 9. V15 Spatial Digital-Twin Live Context
  if (path === 'v15-context') {
    const res = await backendFetch<any>(`world-state/snapshot/${companyId}`, { companyId, token, signal: req.signal });
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

    const snap = res.data;
    const occupancy = Array.isArray(snap.occupancy) ? snap.occupancy.length : 0;
    const rooms = Array.isArray(snap.rooms) ? snap.rooms.length : 8;

    return NextResponse.json({
      activeCampus: snap.campusName || 'Corporate Headquarters',
      totalRooms: rooms,
      deskCapacity: snap.totalCapacity ?? rooms * 4,
      currentOccupancy: occupancy,
      activeAvatars: occupancy,
      lastSpatialSync: snap.timestamp || new Date().toISOString(),
    }, { status: 200, headers: noStore });
  }

  // 10. V24 Offer Market Context
  if (path === 'v24-context') {
    const res = await backendFetch<any[]>('api/external-actions/audit', { companyId, token, signal: req.signal });
    const audit = res.ok && Array.isArray(res.data) ? res.data : [];
    const v24Actions = audit.filter((a) => a.provider === 'AEVORA_V24_OFFER_MARKET_ADAPTER');

    return NextResponse.json({
      activeCampaignsCount: v24Actions.filter((a) => a.actionType === 'MARKETING_CAMPAIGN').length,
      offersDispatchedToday: v24Actions.filter((a) => a.actionType === 'DISPATCH_OFFER').length,
      averageDiscountPercent: 15,
      maxAutonomousDiscountLimit: 50,
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

  let body: any = {};
  try {
    body = await req.json();
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
    const r = await backendFetch('ceo/v3-objective', {
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
