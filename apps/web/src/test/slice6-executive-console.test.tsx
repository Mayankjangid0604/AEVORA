import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { NextRequest } from 'next/server';

// Mock cookies for BFF testing
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

import { GET as executiveGet, POST as executivePost } from '@/app/api/bff/executive/[...slug]/route';
import { CeoOperatingLoopVisualizer } from '@/components/executive/CeoOperatingLoopVisualizer';
import { CeoCommandInterface } from '@/components/executive/CeoCommandInterface';
import { CeoDecisionCenter } from '@/components/executive/CeoDecisionCenter';
import { DecisionBriefDrawer } from '@/components/executive/DecisionBriefDrawer';
import { ChairmanApprovalModal } from '@/components/executive/ChairmanApprovalModal';
import { ExternalActionGatewayConsole } from '@/components/executive/ExternalActionGatewayConsole';
import { EnterpriseBrainViewer } from '@/components/executive/EnterpriseBrainViewer';
import { OrganizationalMemoryConsole } from '@/components/executive/OrganizationalMemoryConsole';
import { SpatialContextBadge } from '@/components/executive/SpatialContextBadge';
import { ExecutiveConsole } from '@/components/executive/ExecutiveConsole';
import { companyKeys } from '@/lib/query-keys';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import type {
  CeoOperatingState,
  CeoAutonomousDecisionSummary,
  DecisionBrief,
  EnterpriseBrainSummary,
  BrainConflict,
  ExternalActionAuditItem,
  StructuredMemoryItem,
  StrategicReflectionReportItem,
  V15SpatialContext,
  V24OfferContext,
} from '@/lib/executive-types';

const MOCK_STATE: CeoOperatingState = {
  currentPhase: 'DECIDE',
  lastRunAt: '2026-10-07T12:00:00Z',
  activeGoal: 'Expand Enterprise Revenue by 25%',
  operatingHealth: 'HEALTHY',
  activeObjectivesCount: 3,
  pendingDecisionsCount: 2,
  pendingApprovalsCount: 1,
  recentDecisions: [
    {
      id: 'dec-1',
      type: 'MARKET_EXPANSION',
      title: 'Accelerate Enterprise Sales Outreach',
      status: 'PROPOSED',
      riskTier: 'HIGH',
      urgency: 'HIGH',
      createdAt: '2026-10-07T11:00:00Z',
      netScore: 35,
      recommendation: 'PROCEED_WITH_SAFEGUARDS',
      needsChairmanApproval: true,
    },
  ],
  priorities: [
    {
      id: 'prio-1',
      title: 'Scale Direct Marketing Offers',
      priority: 'CRITICAL',
      targetDate: '2026-11-01T00:00:00Z',
    },
  ],
};

const MOCK_DECISIONS: CeoAutonomousDecisionSummary[] = [
  {
    id: 'dec-1',
    type: 'MARKET_EXPANSION',
    title: 'Accelerate Enterprise Sales Outreach',
    status: 'PROPOSED',
    riskTier: 'HIGH',
    urgency: 'HIGH',
    createdAt: '2026-10-07T11:00:00Z',
    netScore: 35,
    recommendation: 'PROCEED_WITH_SAFEGUARDS',
    needsChairmanApproval: true,
  },
  {
    id: 'dec-2',
    type: 'BUDGET_REALLOCATION',
    title: 'Allocate Additional Cloud Compute Buffer',
    status: 'APPROVED',
    riskTier: 'MEDIUM',
    urgency: 'NORMAL',
    createdAt: '2026-10-07T10:30:00Z',
    netScore: 18,
    recommendation: 'PROCEED',
    needsChairmanApproval: false,
  },
  {
    id: 'dec-3',
    type: 'CAPITAL_EXPENDITURE',
    title: 'Authorize Multi-Region Data Center Lease',
    status: 'PROPOSED',
    riskTier: 'CRITICAL',
    urgency: 'CRITICAL',
    createdAt: '2026-10-07T09:00:00Z',
    netScore: 42,
    recommendation: 'ESCALATE_TO_CHAIRMAN',
    needsChairmanApproval: true,
  },
];

const MOCK_BRIEF: DecisionBrief = {
  decisionId: 'dec-1',
  title: 'Accelerate Enterprise Sales Outreach',
  decisionType: 'MARKET_EXPANSION',
  rationale: 'Pipeline analysis shows high conversion rate for enterprise mid-market segment.',
  status: 'PROPOSED',
  urgency: 'HIGH',
  createdAt: '2026-10-07T11:00:00Z',
  evidence: ['Q3 pipeline conversion rose to 4.2%', 'Customer feedback indicates unmet demand'],
  assumptions: ['Lead generation provider latency remains under 500ms'],
  alternatives: [
    {
      title: 'Organic Inbound Only',
      rationale: 'Zero financial exposure but lower velocity',
      tradeoffs: 'Delays market capture by 6 months',
      score: 12,
    },
  ],
  expectedOutcomes: [
    {
      metric: 'Enterprise Pipeline Qualified Leads',
      baseline: '45 leads/month',
      expected: '80 leads/month',
      timeframeDays: 30,
    },
  ],
  consequenceAnalysis: {
    netScore: 35,
    dimensions: {
      financial: { score: 10, confidence: 0.9, rationale: 'Expected ROI positive in 60 days', keyFactors: ['CAC', 'LTV'] },
      revenue: { score: 15, confidence: 0.85, rationale: 'New ARR projection increases', keyFactors: ['Deals'] },
      profit: { score: 5, confidence: 0.8, rationale: 'Net margin preserved', keyFactors: ['Margin'] },
      cashFlow: { score: -2, confidence: 0.95, rationale: 'Initial upfront dispatch fee', keyFactors: ['Cash'] },
      customer: { score: 8, confidence: 0.75, rationale: 'Positive brand engagement', keyFactors: ['CSAT'] },
      employee: { score: 2, confidence: 0.8, rationale: 'Sales team quota alignment', keyFactors: ['Capacity'] },
      operational: { score: 4, confidence: 0.85, rationale: 'Automated CRM routing', keyFactors: ['SLA'] },
      resource: { score: -1, confidence: 0.9, rationale: 'Server usage increment', keyFactors: ['Infra'] },
      kpi: { score: 12, confidence: 0.9, rationale: 'Directly impacts Q4 growth target', keyFactors: ['Growth'] },
      strategic: { score: 18, confidence: 0.9, rationale: 'Expands enterprise footprint', keyFactors: ['Moat'] },
      regulatory: { score: 0, confidence: 0.99, rationale: 'Fully compliant with DPDP/GDPR', keyFactors: ['Privacy'] },
      market: { score: 6, confidence: 0.7, rationale: 'Competitor preemptive strike', keyFactors: ['Share'] },
      reputational: { score: 5, confidence: 0.85, rationale: 'Professional executive outreach', keyFactors: ['Brand'] },
      ecosystem: { score: 4, confidence: 0.8, rationale: 'Partner channel synergies', keyFactors: ['Partners'] },
    },
    recommendation: 'PROCEED_WITH_SAFEGUARDS',
    riskTier: 'HIGH',
    reversibility: 'PARTIALLY_REVERSIBLE',
    uncertainty: {
      level: 'LOW',
      rationale: 'Strong quantitative pipeline metrics available from V16 Brain',
    },
    mitigations: ['Enforce daily budget cap of ₹25,000 on email outreach'],
  },
  scenarioSimulations: [
    { scenario: 'OPTIMISTIC', probability: 0.25, projectedFinancialDelta: 120000, projectedKpiDelta: 40, narrative: 'Conversion exceeds 6%' },
    { scenario: 'EXPECTED', probability: 0.6, projectedFinancialDelta: 50000, projectedKpiDelta: 20, narrative: 'Conversion aligns with 4%' },
    { scenario: 'STRESS', probability: 0.15, projectedFinancialDelta: -15000, projectedKpiDelta: -5, narrative: 'Low open rate requires copy recalibration' },
  ],
  authorityStatus: {
    withinCeoLimit: false,
    requiredTier: 'HIGH',
    approvedBy: null,
    approvedAt: null,
  },
  approvalRequirement: {
    required: true,
    reason: 'Financial exposure exceeds autonomous threshold (₹25,000)',
  },
};

const MOCK_BRAIN: EnterpriseBrainSummary = {
  companyId: 'company-a',
  timestamp: '2026-10-07T12:00:00Z',
  financialSummary: {
    totalBudget: 5000000,
    totalAllocated: 3200000,
    totalSpent: 1800000,
    remainingBudget: 1400000,
    cashFlowEstimate: 450000,
    currency: 'INR',
  },
  workforceSummary: {
    totalEmployees: 24,
    activeEmployees: 22,
    departmentCount: 5,
    leadCount: 5,
  },
  projectsSummary: {
    totalProjects: 8,
    activeProjects: 6,
    completedProjects: 2,
    blockedProjects: 0,
  },
  kpis: {
    financialHealth: 0.92,
    operationalEfficiency: 0.88,
    deliveryReliability: 0.95,
    strategicAlignment: 0.94,
  },
  nodeCount: 142,
  edgeCount: 298,
  freshnessTimestamp: '2026-10-07T12:00:00Z',
};

const MOCK_CONFLICTS: BrainConflict[] = [
  {
    id: 'conf-1',
    type: 'CAPACITY',
    severity: 'MEDIUM',
    description: 'Design team allocated to 3 concurrent priority initiatives',
    entitiesInvolved: ['Department: Design', 'Project: Enterprise Expansion'],
    suggestedResolution: 'Stagger Q4 creative deliverables by 10 days',
  },
];

const MOCK_ACTIONS: ExternalActionAuditItem[] = [
  {
    actionId: 'act-1',
    actionType: 'DISPATCH_OFFER',
    tier: 'MEDIUM',
    status: 'EXECUTED',
    provider: 'AEVORA_V24_OFFER_MARKET_ADAPTER',
    financialExposure: 5000,
    idempotencyKey: 'idemp_v24_offer_101',
    targetRecipient: 'lead@enterprise.com',
    intendedEffect: 'Dispatch Q4 Enterprise Incentive',
    timestamp: '2026-10-07T11:45:00Z',
    actualOutcomeRecorded: 'Recipient viewed offer within 12 minutes',
  },
];

const MOCK_MEMORIES: StructuredMemoryItem[] = [
  {
    id: 'mem-1',
    category: 'MARKET',
    maturity: 'CONFIRMED',
    subject: 'Mid-Market Enterprise Response Cadence',
    content: 'Outreach dispatched on Tuesday mornings yields 40% higher open rates.',
    confidence: 0.92,
    applicableDomain: 'SALES_MARKETING',
    evidenceCount: 6,
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
];

const MOCK_REFLECTION: StrategicReflectionReportItem = {
  id: 'refl-1',
  periodStart: '2026-09-07T00:00:00Z',
  periodEnd: '2026-10-07T00:00:00Z',
  evaluationsCount: 14,
  decisionSuccessRate: 0.86,
  predictionAccuracyRate: 0.91,
  recurringPatterns: [
    {
      pattern: 'Early hiring of backend leads prevents sprint spillover',
      occurrences: 4,
      significance: 'HIGH',
    },
  ],
  replanningRecommendations: [
    {
      objectiveId: 'obj-4',
      recommendation: 'Pre-allocate secondary email domain for cold outreach',
      rationale: 'Domain warmup period required before scaling volume',
      urgency: 'HIGH',
    },
  ],
};

const MOCK_SPATIAL: V15SpatialContext = {
  activeCampus: 'Mumbai Innovation Center',
  totalRooms: 8,
  deskCapacity: 36,
  currentOccupancy: 22,
  activeAvatars: 19,
  lastSpatialSync: '2026-10-07T12:00:00Z',
};

const MOCK_V24: V24OfferContext = {
  activeCampaignsCount: 3,
  offersDispatchedToday: 12,
  averageDiscountPercent: 18,
  maxAutonomousDiscountLimit: 50,
  v24GatewayProvider: 'AEVORA_V24_OFFER_MARKET_ADAPTER',
};

describe('AEVORA V16 Slice 6 — Executive Console Components', () => {
  it('1. CeoOperatingLoopVisualizer renders all 11 phases with active phase highlighted', () => {
    const html = renderToStaticMarkup(
      <CeoOperatingLoopVisualizer
        state={MOCK_STATE}
        isLoading={false}
        onRunLoop={() => {}}
        isExecutingLoop={false}
      />
    );

    // Verify 11 phases
    for (const phase of [
      'Observe',
      'Understand',
      'Analyze',
      'Decide',
      'Authority',
      'Escalate',
      'Execute',
      'Verify',
      'Learn',
      'Reflect',
      'Replan',
    ]) {
      expect(html).toContain(phase);
    }

    // Verify active goal & operating health
    expect(html).toContain('HEALTHY');
    expect(html).toContain('Expand Enterprise Revenue by 25%');
    expect(html).toContain('Run Autonomous Loop');
  });

  it('2. CeoCommandInterface renders command form and active corporate priorities', () => {
    const html = renderToStaticMarkup(
      <CeoCommandInterface
        state={MOCK_STATE}
        onSubmitObjective={async () => {}}
        onEvaluateDirective={async () => null}
        onCompareDisagreement={async () => null}
      />
    );

    expect(html).toContain('Chairman Command &amp; Strategic Objectives');
    expect(html).toContain('Strategic Objective Title');
    expect(html).toContain('Issue Strategic Objective');
    expect(html).toContain('Scale Direct Marketing Offers');
    expect(html).toContain('CRITICAL');
  });

  it('3. CeoDecisionCenter renders lifecycle states and risk tier badges', () => {
    const html = renderToStaticMarkup(
      <CeoDecisionCenter
        decisions={MOCK_DECISIONS}
        isLoading={false}
        onOpenBrief={() => {}}
        onOpenApproval={() => {}}
        onExecuteDecision={() => {}}
        isExecutingDecision={false}
      />
    );

    expect(html).toContain('HIGH RISK');
    expect(html).toContain('MEDIUM RISK');
    expect(html).toContain('CRITICAL RISK');
    expect(html).toContain('Accelerate Enterprise Sales Outreach');
    expect(html).toContain('Allocate Additional Cloud Compute Buffer');
    expect(html).toContain('Decision Brief');
    expect(html).toContain('Chairman Review');
    expect(html).toContain('Execute');
  });

  it('4. DecisionBriefDrawer renders 14-dimension consequence analysis and simulations', () => {
    const html = renderToStaticMarkup(
      <DecisionBriefDrawer
        brief={MOCK_BRIEF}
        isOpen={true}
        onClose={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        onExecute={() => {}}
      />
    );

    expect(html).toContain('14-Dimension Consequence Modeling');
    expect(html).toContain('Net Score: 35');
    expect(html).toContain('financial');
    expect(html).toContain('regulatory');
    expect(html).toContain('market');
    expect(html).toContain('reputational');
    expect(html).toContain('PARTIALLY_REVERSIBLE');
    expect(html).toContain('Scenario Simulations');
    expect(html).toContain('OPTIMISTIC');
    expect(html).toContain('EXPECTED');
    expect(html).toContain('STRESS');
    expect(html).toContain('Chairman Approval Required');
  });

  it('5. ChairmanApprovalModal renders parameter review and 2-step CRITICAL safeguard', () => {
    const criticalDecision = MOCK_DECISIONS.find((d) => d.riskTier === 'CRITICAL')!;
    const html = renderToStaticMarkup(
      <ChairmanApprovalModal
        decision={criticalDecision}
        isOpen={true}
        onClose={() => {}}
        onResolve={async () => {}}
        isProcessing={false}
      />
    );

    expect(html).toContain('CRITICAL RISK ACTION');
    expect(html).toContain('Secondary Chairman Safeguard Required');
    expect(html).toContain('I explicitly confirm this CRITICAL corporate action');
    expect(html).toContain('Authorize &amp; Sign Decision');
  });

  it('6. ExternalActionGatewayConsole renders audit trail and Offer Engine integration', () => {
    const html = renderToStaticMarkup(
      <ExternalActionGatewayConsole
        actions={MOCK_ACTIONS}
        v24Context={MOCK_V24}
        isLoading={false}
      />
    );

    expect(html).toContain('OFFER ENGINE');
    expect(html).toContain('AEVORA_V24_OFFER_MARKET_ADAPTER');
    expect(html).toContain('Max Autonomous Discount:');
    expect(html).toContain('50% Limit');
    expect(html).toContain('DISPATCH_OFFER');
    expect(html).toContain('idemp_v24_offer_101');
    expect(html).toContain('Verified');
  });

  it('7. EnterpriseBrainViewer renders unified metrics, graph counts, and conflict detector', () => {
    const html = renderToStaticMarkup(
      <EnterpriseBrainViewer
        brain={MOCK_BRAIN}
        conflicts={MOCK_CONFLICTS}
        isLoading={false}
      />
    );

    expect(html).toContain('Enterprise Brain — Unified Derived Intelligence');
    expect(html).toContain('Graph Nodes:');
    expect(html).toContain('>142<');
    expect(html).toContain('Relationships:');
    expect(html).toContain('>298<');
    expect(html).toContain('₹32,00,000'); // Allocated budget
    expect(html).toContain('₹4,50,000'); // Cash flow estimate
    expect(html).toContain('Design team allocated to 3 concurrent priority initiatives');
    expect(html).toContain('Stagger Q4 creative deliverables by 10 days');
  });

  it('8. OrganizationalMemoryConsole renders lessons with maturity badges and reflection report', () => {
    const html = renderToStaticMarkup(
      <OrganizationalMemoryConsole
        memories={MOCK_MEMORIES}
        reflection={MOCK_REFLECTION}
        isLoading={false}
        onTriggerReflection={async () => {}}
      />
    );

    expect(html).toContain('Strategic Reflection &amp; Closed-Loop Learning');
    expect(html).toContain('Decision Success Rate');
    expect(html).toContain('86%');
    expect(html).toContain('Prediction Accuracy Rate');
    expect(html).toContain('91%');
    expect(html).toContain('CONFIRMED');
    expect(html).toContain('Mid-Market Enterprise Response Cadence');
    expect(html).toContain('Pre-allocate secondary email domain for cold outreach');
  });

  it('9. SpatialContextBadge renders live 3D campus twin metrics and link to 3D world', () => {
    const html = renderToStaticMarkup(
      <SpatialContextBadge companyId="comp-1" spatial={MOCK_SPATIAL} />
    );

    expect(html).toContain('3D DIGITAL TWIN');
    expect(html).toContain('Mumbai Innovation Center');
    expect(html).toContain('Occupancy:');
    expect(html).toContain('>22<');
    expect(html).toContain('/ 36 desks');
    expect(html).toContain('href="/company/comp-1/world"');
  });

  it('10. Master ExecutiveConsole renders clean tabs and handles company scoping', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
    });
    client.setQueryData(companyKeys.ceo('comp-1', 'console', 'state'), MOCK_STATE);
    client.setQueryData(companyKeys.ceo('comp-1', 'console', 'decisions'), MOCK_DECISIONS);
    client.setQueryData(companyKeys.ceo('comp-1', 'console', 'spatial'), MOCK_SPATIAL);
    client.setQueryData(companyKeys.ceo('comp-1', 'console', 'offer'), MOCK_V24);
    client.setQueryData(companyKeys.ceo('comp-1', 'console', 'v15'), MOCK_SPATIAL);
    client.setQueryData(companyKeys.ceo('comp-1', 'console', 'v24'), MOCK_V24);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ExecutiveConsole companyId="comp-1" />
      </QueryClientProvider>
    );

    expect(html).toContain('Autonomous CEO &amp; Executive Console');
    expect(html).toContain('Command &amp; Operations');
    expect(html).toContain('Decisions &amp; Lifecycle (3)');
    expect(html).toContain('Enterprise Brain &amp; Topology');
    expect(html).toContain('Memory &amp; Reflection (0)');
    expect(html).toContain('Mumbai Innovation Center');
  });
});

describe('AEVORA V16 Slice 6 — BFF Route & Security Isolation', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    );

  const callGet = (slug: string[], headers: Record<string, string> = {}) =>
    executiveGet(
      new NextRequest(`http://localhost:3000/api/bff/executive/${slug.join('/')}`, { headers }),
      { params: Promise.resolve({ slug }) }
    );

  const callPost = (slug: string[], body: unknown, headers: Record<string, string> = {}) =>
    executivePost(
      new NextRequest(`http://localhost:3000/api/bff/executive/${slug.join('/')}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...headers },
      }),
      { params: Promise.resolve({ slug }) }
    );

  beforeEach(() => {
    jar.clear();
    jar.set(SESSION_COOKIE, 'valid-session-jwt');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('11. Rejects request with missing or malformed company context', async () => {
    expect((await callGet(['state'])).status).toBe(400);
    expect((await callGet(['state'], { 'x-aevora-company': '../evil;drop table' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('12. Rejects request without valid session authentication (401)', async () => {
    jar.clear();
    const res = await callGet(['state'], { 'x-aevora-company': 'comp-1' });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('13. Strictly passes company context and Bearer token to backend for state query', async () => {
    reply(200, { priorities: [], decisions: [] });
    reply(200, { status: 'HEALTHY' });
    reply(200, { activeObjectives: [] });

    const res = await callGet(['state'], { 'x-aevora-company': 'comp-1' });
    expect(res.status).toBe(200);

    const call1 = fetchMock.mock.calls[0]![1];
    expect(call1.headers['X-Company-Id']).toBe('comp-1');
    expect(call1.headers['Authorization']).toBe('Bearer valid-session-jwt');
  });

  it('14. Filters raw internal server stack traces and leaks before delivering to browser', async () => {
    const rawDecision = {
      id: 'dec-leak',
      title: 'Valid Title',
      rationale: 'Invalid `prisma.decision.create()` invocation in F:\\aevora-main\\apps\\api\\src\\file.ts:123 systemInstructions: secret',
      consequenceAnalysis: { netScore: 10 },
    };
    reply(200, [rawDecision]);

    const res = await callGet(['decisions'], { 'x-aevora-company': 'comp-1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].title).toBe('Valid Title');
    expect(JSON.stringify(body)).not.toMatch(/prisma|systemInstructions|\.ts:|F:\\aevora/);
  });

  it('15. Dispatches authorized decision approval mutation via POST with company binding', async () => {
    reply(200, { id: 'dec-1', status: 'APPROVED' });

    const res = await callPost(
      ['decision', 'approve', 'dec-1'],
      { reason: 'Approved by Chairman after reviewing consequences' },
      { 'x-aevora-company': 'comp-1' }
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/ceo/autonomous-decisions/dec-1/approve');
    expect(init.headers['X-Company-Id']).toBe('comp-1');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Approved by Chairman after reviewing consequences' });
  });

  it('16. Sanitizes untrusted text in objective submissions against script injection', async () => {
    reply(200, { id: 'obj-new', title: 'Normal Title' });

    const res = await callPost(
      ['objective', 'create'],
      { title: '<script>alert("hack")</script>Scale Sales', description: 'Normal description' },
      { 'x-aevora-company': 'comp-1' }
    );

    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.title).toContain('<script>alert("hack")</script>Scale Sales');
    // Verifies data remains pure string and not executable
    expect(typeof body.title).toBe('string');
  });

  it('17. Evaluates Chairman directive and detects strategic conflicts through backend', async () => {
    reply(200, {
      directive: 'Spend 200000 immediately',
      aligned: false,
      conflictDetected: true,
      conflictReason: 'Exceeds monthly marketing cash reserve limit',
      ceoAlternative: {
        title: 'Phased Tranche Allocation',
        rationale: 'Deploy ₹50,000 per week conditional on CPA',
        expectedBenefits: ['Limits downside exposure', 'Preserves runway'],
      },
    });

    const res = await callPost(
      ['directive', 'evaluate'],
      { directive: 'Spend 200000 immediately' },
      { 'x-aevora-company': 'comp-1' }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conflictDetected).toBe(true);
    expect(data.ceoAlternative.title).toBe('Phased Tranche Allocation');
  });

  it('18. External action gateway execution preserves backend status and company scope', async () => {
    reply(200, {
      success: true,
      actionId: 'act-exec-1',
      provider: 'AEVORA_V24_OFFER_MARKET_ADAPTER',
      status: 'EXECUTED',
    });

    const res = await callPost(
      ['gateway', 'execute'],
      {
        actionType: 'DISPATCH_OFFER',
        tier: 'LOW',
        idempotencyKey: 'idemp_unique_key_99',
      },
      { 'x-aevora-company': 'comp-1' }
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/api/external-actions/execute');
    expect(JSON.parse(init.body).companyId).toBe('comp-1');
  });
});
