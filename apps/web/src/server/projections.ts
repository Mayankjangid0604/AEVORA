/**
 * Server-side response projections for BFF routes whose backend payload carries more than the UI may see
 * (e.g. Employee.salary, identitySeed, performance scores). Only the listed fields ever reach the browser.
 * A projection returning `undefined` means "not found" (the BFF answers 404).
 */
import type { AgentView, AssistantMessageView, ChairmanMailView, OperatingCycleView, ContentPostView, LeadGenRunView, SalesLeadView, CeoFeedItem, CeoQuestionView, ManagementDecision, OperationalAlert, TaskDetail, TaskSummary, AssistanceRequestView, DecisionProposalView, IntelligenceSessionView, IntelligenceSummary, DepartmentSummary, EmployeeSummary, ProjectDetail, ProjectMilestone, ProjectRequirement, ProjectRisk, ProjectSummary, ProjectTeamMember, WorkerProvenance, OfferView, OfferMeasurementView, OfferOptimizationView, InquiryView, JobView, PipelineOpportunity, PipelineProposal, DeliveryProjectRow, DeliveryProject, DeliveryHistoryEvent, EmailStatusView, AutomationStatusView } from '@/lib/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function department(v: unknown): DepartmentSummary | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  return { id: v.id as string, name: v.name as string, status: str(v.status) ?? 'UNKNOWN' };
}

function employee(v: unknown): EmployeeSummary | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  const role = isObj(v.role) ? { title: str(v.role.title) ?? 'Unknown role' } : null;
  const dept = isObj(v.department) && str(v.department.id) ? { id: v.department.id as string, name: str(v.department.name) ?? 'Unknown department' } : null;
  return { id: v.id as string, name: v.name as string, status: str(v.status) ?? 'UNKNOWN', hireDate: str(v.hireDate), role, department: dept };
}

function provenance(v: unknown): WorkerProvenance | undefined {
  if (!isObj(v) || !str(v.employeeId) || !str(v.workerType)) return undefined;
  return { employeeId: v.employeeId as string, workerType: v.workerType as string };
}

function projectBase(v: Obj): Omit<ProjectSummary, 'assignmentCount'> {
  return {
    id: v.id as string,
    name: v.name as string,
    description: str(v.description),
    type: str(v.type) ?? 'UNKNOWN',
    status: str(v.status) ?? 'UNKNOWN',
    startDate: str(v.startDate),
    targetEndDate: str(v.targetEndDate),
    client: isObj(v.client) && str(v.client.name) ? { name: v.client.name as string } : null,
  };
}

function project(v: unknown): ProjectSummary | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  return { ...projectBase(v), assignmentCount: Array.isArray(v.assignments) ? v.assignments.length : 0 };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function projectDetail(v: unknown): ProjectDetail | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  const milestones: ProjectMilestone[] = arr(v.milestones).filter(isObj).filter((m) => str(m.id) && str(m.name)).map((m) => ({
    id: m.id as string, name: m.name as string, sequence: num(m.sequence) ?? 0, dueAt: str(m.dueAt), status: str(m.status) ?? 'UNKNOWN',
  }));
  const risks: ProjectRisk[] = arr(v.risks).filter(isObj).filter((r) => str(r.id) && str(r.title)).map((r) => ({
    id: r.id as string, title: r.title as string, severity: num(r.severity) ?? 0, status: str(r.status) ?? 'UNKNOWN',
  }));
  const requirements: ProjectRequirement[] = arr(v.requirements).filter(isObj).filter((r) => str(r.id) && str(r.title)).map((r) => ({
    id: r.id as string, title: r.title as string, priority: str(r.priority) ?? 'UNKNOWN', status: str(r.status) ?? 'UNKNOWN',
  }));
  const team: ProjectTeamMember[] = arr(v.assignments).filter(isObj).filter((a) => isObj(a.employee) && str(a.employeeId)).map((a) => ({
    employeeId: a.employeeId as string,
    name: str((a.employee as Obj).name) ?? 'Unknown',
    role: str(a.role) ?? '—',
    allocation: num(a.allocation) ?? 0,
    status: str(a.status) ?? 'UNKNOWN',
  }));
  return { ...projectBase(v), milestones, risks, requirements, team };
}

/** Non-finance metric domains whose values are plain counts. */
const COUNT_DOMAINS = new Set(['Workforce', 'Projects']);

function intelligenceSummary(v: unknown): IntelligenceSummary | undefined {
  if (!isObj(v)) return undefined;
  const titled = (x: unknown) => arr(x).filter(isObj).filter((o) => str(o.title));
  return {
    generatedAt: str(v.generatedAt),
    metrics: arr(v.metrics).filter(isObj)
      .filter((m) => str(m.key) && str(m.domain) && COUNT_DOMAINS.has(m.domain as string) && num(m.value) !== null)
      .map((m) => ({ key: m.key as string, value: m.value as number, domain: m.domain as string })),
    facts: arr(v.facts).filter(isObj).filter((f) => str(f.statement)).map((f) => ({ statement: f.statement as string, source: str(f.source) })),
    risks: titled(v.risks).map((r) => ({ title: r.title as string, count: num(r.count) })),
    opportunities: titled(v.opportunities).map((r) => ({ title: r.title as string, count: num(r.count) })),
    trends: titled(v.trends).map((t) => ({ title: t.title as string, description: str(t.description) })),
    missingData: arr(v.missingData).filter((m): m is string => typeof m === 'string'),
    sources: isObj(v.sourceFreshness)
      ? Object.entries(v.sourceFreshness).filter(([, at]) => typeof at === 'string').map(([name, at]) => ({ name, asOf: at as string }))
      : [],
  };
}

function proposal(v: unknown): DecisionProposalView | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.title)) return undefined;
  return {
    id: v.id as string,
    title: v.title as string,
    problem: str(v.problem) ?? '',
    recommendation: str(v.recommendation) ?? '',
    rationale: str(v.rationale) ?? '',
    confidence: str(v.confidence) ?? 'Not recorded',
    impactLevel: str(v.impactLevel) ?? 'Not recorded',
    status: str(v.status) ?? 'UNKNOWN',
    createdAt: str(v.createdAt) ?? '',
    sessionId: str(v.sessionId),
    proposerId: str(v.employeeId),
    options: arr(v.options).filter(isObj).filter((o) => str(o.id) && str(o.title)).map((o) => ({
      id: o.id as string, title: o.title as string, description: str(o.description) ?? '',
      estimatedEffort: str(o.estimatedEffort), estimatedImpact: str(o.estimatedImpact), score: num(o.score),
    })),
    reviews: arr(v.reviews).filter(isObj).filter((r) => str(r.id)).map((r) => ({
      id: r.id as string, result: str(r.result) ?? 'UNKNOWN', feedback: str(r.feedback), createdAt: str(r.createdAt) ?? '',
    })),
  };
}

function assistanceRequest(v: unknown): AssistanceRequestView | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.question)) return undefined;
  return { id: v.id as string, question: v.question as string, reason: str(v.reason), urgency: str(v.urgency) ?? 'UNKNOWN', status: str(v.status) ?? 'UNKNOWN', createdAt: str(v.createdAt) ?? '' };
}

function session(v: unknown): IntelligenceSessionView | undefined {
  if (!isObj(v) || !str(v.id)) return undefined;
  return {
    id: v.id as string,
    objective: str(v.objective) ?? '',
    status: str(v.status) ?? 'UNKNOWN',
    createdAt: str(v.createdAt) ?? '',
    updatedAt: str(v.updatedAt) ?? '',
    assessments: arr(v.assessments).filter(isObj).filter((a) => str(a.id)).map((a) => ({
      id: a.id as string, summary: str(a.summary) ?? '', recommendation: str(a.recommendation) ?? '', createdAt: str(a.createdAt) ?? '',
    })),
    proposals: arr(v.proposals).filter(isObj).filter((p) => str(p.id) && str(p.title)).map((p) => ({
      id: p.id as string, title: p.title as string, status: str(p.status) ?? 'UNKNOWN',
    })),
  };
}

function taskSummary(v: Obj): TaskSummary {
  return {
    id: v.id as string, title: v.title as string, status: str(v.status) ?? 'UNKNOWN', priority: str(v.priority) ?? 'UNKNOWN',
    type: str(v.type) ?? 'UNKNOWN', progress: num(v.progress), dueAt: str(v.dueAt), createdAt: str(v.createdAt),
    completedAt: str(v.completedAt), assignedEmployeeId: str(v.assignedEmployeeId),
  };
}
const isTask = (v: unknown): v is Obj => isObj(v) && !!str(v.id) && !!str(v.title);

/** Only tasks owned by the selected company context are returned (a multi-company Chairman stays in context). */
function tasksInContext(v: unknown, companyId?: string): TaskSummary[] {
  return arr(v).filter(isTask).filter((t) => t.companyId === companyId).map(taskSummary);
}

function taskInContext(v: unknown, companyId?: string): TaskDetail | undefined {
  if (!isTask(v) || v.companyId !== companyId) return undefined;
  const ids = (rows: unknown, key: string) => arr(rows).filter(isObj).map((d) => str(d[key])).filter((x): x is string => !!x);
  return {
    ...taskSummary(v),
    description: str(v.description), estimatedEffort: num(v.estimatedEffort), actualEffort: num(v.actualEffort),
    startedAt: str(v.startedAt), updatedAt: str(v.updatedAt), goalId: str(v.goalId), projectId: str(v.projectId),
    departmentId: str(v.departmentId), parentTaskId: str(v.parentTaskId),
    dependsOn: ids(v.dependencies, 'dependsOnId'),
    requiredBy: ids(v.dependentOn, 'taskId'),
  };
}

const list = <T>(one: (v: unknown) => T | undefined) => (v: unknown): T[] =>
  (Array.isArray(v) ? v : []).map(one).filter((x): x is T => x !== undefined);

const ref = (v: unknown) => (isObj(v) && str(v.id) ? { id: v.id as string, name: str(v.name) ?? 'Unknown' } : null);
const inCompany = (v: unknown, companyId?: string): v is Obj => isObj(v) && !!str(v.id) && v.companyId === companyId;

function alerts(v: unknown, companyId?: string): OperationalAlert[] {
  return arr(v).filter((a) => inCompany(a, companyId)).map((a) => a as Obj).map((a) => ({
    id: a.id as string, severity: (str(a.severity) ?? 'INFO') as OperationalAlert['severity'], category: str(a.category) ?? '', title: str(a.title) ?? '',
    description: str(a.description), status: str(a.status) ?? 'UNKNOWN', createdAt: str(a.createdAt) ?? '', acknowledgedAt: str(a.acknowledgedAt), resolvedAt: str(a.resolvedAt),
  }));
}

// payload JSON and approvedBy (an actor id) are never forwarded.
function decisions(v: unknown, companyId?: string): ManagementDecision[] {
  return arr(v).filter((d) => inCompany(d, companyId)).map((d) => d as Obj).map((d) => ({
    id: d.id as string, type: str(d.type) ?? '', title: str(d.title) ?? '', status: (str(d.status) ?? 'PROPOSED') as ManagementDecision['status'],
    createdAt: str(d.createdAt) ?? '', proposer: ref(d.proposer), description: str(d.description), updatedAt: str(d.updatedAt),
    approvedAt: str(d.approvedAt), targetEmployee: ref(d.targetEmployee),
  }));
}

/**
 * Persisted CEO action details can contain a raw backend error (stack frames, server file paths, source excerpts
 * with agent configuration). Such text is internal and is replaced, never forwarded.
 */
const INTERNAL_ERROR = /invocation in|\.(ts|js):\d+|\bat [\w.<>]+ \(|prisma\.|[A-Z]:\\[\w-]|systemInstructions|stack trace/i;
const safeDetail = (d: string | null) => (d && INTERNAL_ERROR.test(d) ? 'An internal error was recorded for this action (details are not shown).' : d ?? '');

// Feed items carry no companyId; the backend scopes them to the X-Company-Id the BFF forwards.
function ceoFeed(v: unknown): CeoFeedItem[] {
  return arr(v).filter(isObj).filter((f) => str(f.id) && str(f.at)).map((f) => ({
    id: f.id as string, at: f.at as string, kind: str(f.kind) ?? 'UNKNOWN', outcome: str(f.outcome),
    title: INTERNAL_ERROR.test(str(f.title) ?? '') ? 'CEO action (internal error recorded)' : str(f.title) ?? '', detail: safeDetail(str(f.detail)),
  }));
}

// context JSON (CEO-internal working data) is never forwarded.
function ceoQuestions(v: unknown, companyId?: string): CeoQuestionView[] {
  return arr(v).filter((q) => inCompany(q, companyId)).map((q) => q as Obj).map((q) => ({
    id: q.id as string, question: str(q.question) ?? '', urgency: str(q.urgency) ?? 'UNKNOWN', status: str(q.status) ?? 'UNKNOWN',
    askedAt: str(q.askedAt) ?? '', answeredAt: str(q.answeredAt), chairmanAnswer: str(q.chairmanAnswer),
  }));
}

function contentPosts(v: unknown, companyId?: string): ContentPostView[] {
  return arr(v).filter((p) => inCompany(p, companyId)).map((p) => p as Obj).map((p) => ({
    id: p.id as string, platform: str(p.platform) ?? '', contentType: str(p.contentType) ?? '', caption: str(p.caption) ?? '',
    hashtags: arr(p.hashtags).filter((h): h is string => typeof h === 'string'), status: str(p.status) ?? 'UNKNOWN',
    scheduledFor: str(p.scheduledFor), postedAt: str(p.postedAt), createdAt: str(p.createdAt) ?? '',
  }));
}

function leadGenRuns(v: unknown, companyId?: string): LeadGenRunView[] {
  return arr(v).filter((r) => inCompany(r, companyId)).map((r) => r as Obj).map((r) => ({
    id: r.id as string, status: str(r.status) ?? 'UNKNOWN', triggeredBy: str(r.triggeredBy) ?? '', triggeredAt: str(r.triggeredAt) ?? '',
    completedAt: str(r.completedAt), totalFound: num(r.totalFound), totalNew: num(r.totalNew),
  }));
}

function salesLeads(v: unknown, companyId?: string): SalesLeadView[] {
  return arr(v).filter((l) => inCompany(l, companyId)).map((l) => l as Obj).map((l) => ({
    id: l.id as string, name: str(l.name) ?? '', industry: str(l.industry), geography: str(l.geography), companySize: str(l.companySize),
    status: str(l.status) ?? 'UNKNOWN', source: str(l.source), createdAt: str(l.createdAt) ?? '', lastContactedAt: str(l.lastContactedAt),
  }));
}

function operatingCycle(v: unknown, companyId?: string): OperatingCycleView | undefined {
  if (!inCompany(v, companyId)) return undefined;
  const rec = isObj(v.recommendation) && str(v.recommendation.title) ? v.recommendation : null;
  const ex = isObj(v.execution) && Object.keys(v.execution).length ? v.execution : null;
  return {
    id: v.id as string, phase: str(v.phase) ?? 'UNKNOWN', trigger: str(v.trigger) ?? '', chairmanVerdict: str(v.chairmanVerdict),
    startedAt: str(v.startedAt) ?? '', completedAt: str(v.completedAt), failed: !!v.error,
    recommendation: rec && { title: rec.title as string, impact: str(rec.impact), effort: str(rec.effort), risk: str(rec.risk) },
    execution: ex && { action: str(ex.action), dispatched: typeof ex.dispatched === 'boolean' ? ex.dispatched : null, result: str(ex.result) },
  };
}

function assistantMessages(v: unknown, companyId?: string): AssistantMessageView[] {
  return arr(v).filter((m) => inCompany(m, companyId)).map((m) => m as Obj).map((m) => ({
    id: m.id as string, from: str(m.from) ?? 'UNKNOWN', to: str(m.to) ?? 'UNKNOWN', content: str(m.content) ?? '',
    status: str(m.status) ?? 'UNKNOWN', createdAt: str(m.createdAt) ?? '',
  }));
}

// The backend list already selects safe columns (no body/data/emailMessageId) and filters by req.user.companyId.
function chairmanMail(v: unknown): ChairmanMailView[] {
  return arr(v).filter(isObj).filter((m) => str(m.id)).map((m) => ({
    id: m.id as string, ref: str(m.ref) ?? '', event: str(m.event) ?? '', category: str(m.category) ?? '', title: str(m.title) ?? '',
    status: str(m.status) ?? 'UNKNOWN', read: !!m.readAt, createdAt: str(m.createdAt) ?? '',
    messageCount: isObj(m._count) ? num(m._count.messages) ?? 0 : 0,
  }));
}

const unreadCount = (v: unknown) => (isObj(v) && num(v.count) !== null ? { count: v.count as number } : undefined);

// Agent rows carry no companyId; the backend filters by employee.companyId = req.user.companyId.
function agents(v: unknown): AgentView[] {
  return arr(v).filter(isObj).filter((a) => str(a.id) && str(a.employeeId)).map((a) => ({
    id: a.id as string, employeeId: a.employeeId as string, status: str(a.status) ?? 'UNKNOWN',
    autonomyLevel: str(a.autonomyLevel) ?? 'UNKNOWN', createdAt: str(a.createdAt) ?? '',
  }));
}

/** companyId = the explicit company context of the request (for context-ownership checks). */
export type Projection = (body: unknown, companyId?: string) => unknown;

// Gate 4A operator queue. Inquiry rows come from a tenant-scoped endpoint; the projection also drops other tenants'
// rows defensively (none carry companyId, so it is enforced by the backend select) and keeps only operator fields.
const INQUIRY_STATUSES = ['NEW', 'UNDER_REVIEW', 'QUALIFIED', 'REJECTED', 'CONVERTED'];
function inquiry(v: unknown): InquiryView | undefined {
  if (!isObj(v) || !str(v.id) || !INQUIRY_STATUSES.includes(str(v.status) ?? '')) return undefined;
  return {
    id: v.id as string, reference: str(v.publicRef), status: v.status as string, title: str(v.title) ?? '',
    description: str(v.description) ?? '', businessName: str(v.businessName), contactName: str(v.contactName),
    contactEmail: str(v.contactEmail), contactPhone: str(v.contactPhone), service: str(v.serviceRequested),
    source: str(v.source), notes: str(v.internalNotes), receivedAt: str(v.receivedAt) ?? '', updatedAt: str(v.updatedAt) ?? '',
  };
}
function job(v: unknown): JobView | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.type) || !str(v.status)) return undefined;
  return {
    id: v.id as string, type: v.type as string, status: v.status as string, attempts: num(v.attempts) ?? 0, maxAttempts: num(v.maxAttempts) ?? 0,
    lastError: str(v.lastError), createdAt: str(v.createdAt) ?? '', updatedAt: str(v.updatedAt) ?? '', completedAt: str(v.completedAt),
  };
}

// ---- Opportunity -> proposal -> project pipeline ----
const PLACEHOLDER = 'DRAFT PLACEHOLDER';
function pipelineOpportunity(v: unknown): PipelineOpportunity | undefined {
  if (!isObj(v) || !str(v.id)) return undefined;
  return {
    id: v.id as string, title: str(v.title) ?? '', status: str(v.status) ?? '', salesStage: str(v.salesStage) ?? '', estimatedValue: num(v.estimatedValue),
    currency: str(v.currency) ?? 'INR', createdAt: str(v.createdAt) ?? '',
    clientName: isObj(v.client) ? str(v.client.name) : null, reference: isObj(v.inquiry) ? str(v.inquiry.publicRef) : null,
    proposals: arr(v.proposals).filter(isObj).filter((p) => str(p.id)).map((p) => ({ id: p.id as string, status: str(p.status) ?? '', version: num(p.version) ?? 1, total: num(p.total) ?? 0, currency: str(p.currency) ?? 'INR' })),
    projects: arr(v.projects).filter(isObj).filter((p) => str(p.id)).map((p) => ({ id: p.id as string, name: str(p.name) ?? '', status: str(p.status) ?? '' })),
  };
}
function pipelineProposal(v: unknown): PipelineProposal | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.status)) return undefined;
  const approvals = arr(v.approvals).filter(isObj).map((a) => ({ decision: str(a.decision) ?? '', reason: str(a.reason), at: str(a.timestamp) ?? '' }));
  const scope = str(v.scope) ?? '', deliverables = str(v.deliverables) ?? '', unitPrice = num(v.unitPrice) ?? 0, timeline = num(v.estimatedTimeline);
  const missing: string[] = [];
  if (!scope.trim() || scope.includes(PLACEHOLDER)) missing.push('scope');
  if (!deliverables.trim() || deliverables.includes(PLACEHOLDER)) missing.push('deliverables');
  if (!(unitPrice > 0)) missing.push('price');
  if (!(timeline && timeline > 0)) missing.push('timeline');
  if (!(str(v.paymentTerms) ?? '').trim()) missing.push('payment terms');
  const projects = arr(v.projects).filter(isObj);
  return {
    id: v.id as string, opportunityId: str(v.opportunityId) ?? '', customerName: isObj(v.customer) ? str(v.customer.name) : null, title: str(v.title) ?? '',
    version: num(v.version) ?? 1, status: v.status as string, scope, deliverables, assumptions: str(v.assumptions), exclusions: str(v.exclusions), paymentTerms: str(v.paymentTerms),
    currency: str(v.currency) ?? 'INR', quantity: num(v.quantity) ?? 1, unitPrice, discount: num(v.discount) ?? 0, tax: num(v.tax) ?? 0, total: num(v.total) ?? 0,
    estimatedTimeline: timeline, validityPeriod: num(v.validityPeriod) ?? 30, internalEstimatedCost: num(v.internalEstimatedCost),
    approvals, approved: approvals.at(-1)?.decision === 'APPROVE', missing, projectId: str(projects[0]?.id) ?? null,
  };
}
function pipelineGenerated(v: unknown): { created: boolean; proposal: PipelineProposal } | undefined {
  if (!isObj(v)) return undefined;
  const proposal = pipelineProposal(v.proposal);
  return proposal ? { created: v.created === true, proposal } : undefined;
}
function deliveryRow(v: unknown): DeliveryProjectRow | undefined {
  if (!isObj(v) || !str(v.id)) return undefined;
  return { id: v.id as string, name: str(v.name) ?? '', status: str(v.status) ?? '', quotedPrice: num(v.quotedPrice), clientName: isObj(v.client) ? str(v.client.name) : null, taskCount: isObj(v._count) ? num(v._count.tasks) ?? 0 : 0, createdAt: str(v.createdAt) ?? '' };
}
function deliveryProject(v: unknown): DeliveryProject | undefined {
  if (!isObj(v) || !str(v.id)) return undefined;
  return {
    id: v.id as string, name: str(v.name) ?? '', status: str(v.status) ?? '', quotedPrice: num(v.quotedPrice), clientName: isObj(v.client) ? str(v.client.name) : null, createdAt: str(v.createdAt) ?? '',
    opportunityTitle: isObj(v.opportunity) ? str(v.opportunity.title) : null, proposalTitle: isObj(v.proposal) ? str(v.proposal.title) : null, proposalId: isObj(v.proposal) ? str(v.proposal.id) : null,
    tasks: arr(v.tasks).filter(isObj).filter((t) => str(t.id)).map((t) => ({ id: t.id as string, title: str(t.title) ?? '', description: str(t.description), status: str(t.status) ?? '', priority: str(t.priority) ?? 'NORMAL', assignedEmployeeId: str(t.assignedEmployeeId), dueAt: str(t.dueAt) })),
  };
}
function deliveryHistoryEvent(v: unknown): DeliveryHistoryEvent | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.action)) return undefined;
  return { id: v.id as string, action: v.action as string, actorType: str(v.actorType) ?? '', at: str(v.timestamp) ?? '' };
}
function emailStatusView(v: unknown): EmailStatusView | undefined {
  if (!isObj(v) || !str(v.provider)) return undefined;
  const t = isObj(v.lastTest) ? v.lastTest : null;
  return {
    provider: v.provider as string, configValid: v.configValid === true, problems: arr(v.problems).filter((p): p is string => typeof p === 'string'), safeMode: v.safeMode === true,
    outreachEnvironment: str(v.outreachEnvironment) ?? 'SANDBOX', generalOutreachEnabled: v.generalOutreachEnabled === true,
    lastTest: t ? { at: str(t.at) ?? '', recipient: str(t.recipient) ?? '', smtpAccepted: t.smtpAccepted === true, smtpResponse: str(t.smtpResponse), error: str(t.error), inboxDelivery: str(t.inboxDelivery) ?? 'NOT_VERIFIED' } : null,
  };
}
function automationStatus(v: unknown): AutomationStatusView | undefined {
  if (!isObj(v) || !str(v.state)) return undefined;
  return { enabled: v.enabled === true, state: v.state as string, attempts: num(v.attempts) ?? 0, maxAttempts: num(v.maxAttempts) ?? 0, lastError: str(v.lastError) };
}
function createdFlag(v: unknown): { created: boolean } | undefined {
  return isObj(v) ? { created: v.created === true } : undefined;
}
function projectCreated(v: unknown): { created: boolean; projectId: string } | undefined {
  return isObj(v) && isObj(v.project) && str(v.project.id) ? { created: v.created === true, projectId: v.project.id as string } : undefined;
}

function companyRecord(v: unknown): { id: string; name: string; legalName: string | null; description: string | null; status: string } | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  return { id: v.id as string, name: v.name as string, legalName: str(v.legalName), description: str(v.description), status: str(v.status) ?? 'ACTIVE' };
}

export const projections = {
  pipelineOpportunities: list(pipelineOpportunity),
  pipelineProposal,
  pipelineGenerated,
  projectCreated,
  deliveryProjects: list(deliveryRow),
  deliveryProject,
  deliveryHistory: list(deliveryHistoryEvent),
  createdFlag,
  emailStatus: emailStatusView,
  companyRecord,
  automationStatus,
  departments: list(department),
  department, // backend returns null for a missing or foreign id -> undefined -> 404
  employees: list(employee),
  employee,
  provenanceList: list(provenance),
  provenance,
  projects: list(project),
  project: projectDetail,
  intelligenceSummary,
  proposals: list(proposal),
  assistanceRequests: list(assistanceRequest),
  session,
  employeeTasks: tasksInContext,
  task: taskInContext,
  alerts,
  decisions,
  ceoFeed,
  ceoQuestions,
  contentPosts,
  leadGenRuns,
  salesLeads,
  operatingCycles: (v: unknown, companyId?: string) => arr(v).map((c) => operatingCycle(c, companyId)).filter((c): c is OperatingCycleView => !!c),
  operatingCycle,
  assistantMessages,
  chairmanMail,
  unreadCount,
  agents,
  offers: list(offer),
  offer,
  offerMeasurement,
  offerOptimization,
  inquiries: list(inquiry),
  inquiry,
  jobs: list(job),
  job,
} satisfies Record<string, Projection>;

function offer(v: unknown): OfferView | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  const mt = isObj(v.materialTerms) ? v.materialTerms : {};
  const hasAppr = isObj(v.approvalBinding) && !!v.approvalBinding.approvalId;

  return {
    id: v.id as string,
    companyId: str(v.companyId) ?? '',
    name: v.name as string,
    description: str(v.description) ?? '',
    status: str(v.status) ?? 'DRAFT',
    creatorRole: str(v.creatorRole) ?? 'CHAIRMAN',
    version: num(v.version) ?? 1,
    termsVersion: num(v.termsVersion) ?? 1,
    originalPrice: num(mt.originalPrice) ?? 0,
    discountType: str(mt.discountType) ?? 'PERCENTAGE',
    discountValue: num(mt.discountValue) ?? 0,
    finalPrice: num(mt.finalPrice) ?? 0,
    currency: str(mt.currency) ?? 'USD',
    validFrom: str(mt.validFrom) ?? '',
    validUntil: str(mt.validUntil) ?? '',
    maxRedemptions: num(mt.maxRedemptions),
    currentRedemptions: num(v.currentRedemptions) ?? 0,
    targetAudience: str(mt.targetAudience) ?? 'GENERAL',
    termsAndConditions: str(mt.termsAndConditions) ?? '',
    isChairmanGated: !!v.isChairmanGated,
    requiresChairmanApproval: !!v.requiresChairmanApproval,
    hasApproval: hasAppr,
    approvalId: isObj(v.approvalBinding) ? str(v.approvalBinding.approvalId) ?? undefined : undefined,
    approvedBy: isObj(v.approvalBinding) ? str(v.approvalBinding.approvedBy) ?? undefined : undefined,
    parametersHash: isObj(v.approvalBinding) ? str(v.approvalBinding.parametersHash) ?? undefined : undefined,
    rejectionReason: str(v.rejectionReason) ?? undefined,
    suspensionReason: str(v.suspensionReason) ?? undefined,
    termsHistory: arr(v.termsHistory).filter(isObj).map((th) => ({
      version: num(th.version) ?? 1,
      terms: str(th.terms) ?? '',
      changedAt: str(th.changedAt) ?? '',
      changedBy: str(th.changedBy) ?? '',
      changeReason: str(th.changeReason) ?? undefined,
    })),
    financialAnalysis: isObj(v.financialAnalysis) ? {
      expectedRevenue: num(v.financialAnalysis.expectedRevenue) ?? 0,
      baselineRevenue: num(v.financialAnalysis.baselineRevenue) ?? 0,
      incrementalRevenue: num(v.financialAnalysis.incrementalRevenue) ?? 0,
      discountCost: num(v.financialAnalysis.discountCost) ?? 0,
      grossProfit: num(v.financialAnalysis.grossProfit) ?? 0,
      contributionProfit: num(v.financialAnalysis.contributionProfit) ?? 0,
      postDiscountMarginPct: num(v.financialAnalysis.postDiscountMarginPct) ?? 0,
      marginErosionPct: num(v.financialAnalysis.marginErosionPct) ?? 0,
      breakEvenVolume: isObj(v.financialAnalysis.breakEven) ? num(v.financialAnalysis.breakEven.volume) ?? 0 : 0,
      cannibalizationRisk: isObj(v.financialAnalysis.cannibalizationRisk) ? {
        percentage: num(v.financialAnalysis.cannibalizationRisk.percentage) ?? 0,
        estimatedRevenueLoss: num(v.financialAnalysis.cannibalizationRisk.estimatedRevenueLoss) ?? 0,
        severity: str(v.financialAnalysis.cannibalizationRisk.severity) ?? 'LOW',
      } : { percentage: 0, estimatedRevenueLoss: 0, severity: 'LOW' },
      scenarios: isObj(v.financialAnalysis.scenarios) ? {
        bestCase: isObj(v.financialAnalysis.scenarios.bestCase) ? {
          volume: num(v.financialAnalysis.scenarios.bestCase.volume) ?? 0,
          revenue: num(v.financialAnalysis.scenarios.bestCase.revenue) ?? 0,
          grossProfit: num(v.financialAnalysis.scenarios.bestCase.grossProfit) ?? 0,
          contributionProfit: num(v.financialAnalysis.scenarios.bestCase.contributionProfit) ?? 0,
        } : { volume: 0, revenue: 0, grossProfit: 0, contributionProfit: 0 },
        expectedCase: isObj(v.financialAnalysis.scenarios.expectedCase) ? {
          volume: num(v.financialAnalysis.scenarios.expectedCase.volume) ?? 0,
          revenue: num(v.financialAnalysis.scenarios.expectedCase.revenue) ?? 0,
          grossProfit: num(v.financialAnalysis.scenarios.expectedCase.grossProfit) ?? 0,
          contributionProfit: num(v.financialAnalysis.scenarios.expectedCase.contributionProfit) ?? 0,
        } : { volume: 0, revenue: 0, grossProfit: 0, contributionProfit: 0 },
        worstCase: isObj(v.financialAnalysis.scenarios.worstCase) ? {
          volume: num(v.financialAnalysis.scenarios.worstCase.volume) ?? 0,
          revenue: num(v.financialAnalysis.scenarios.worstCase.revenue) ?? 0,
          grossProfit: num(v.financialAnalysis.scenarios.worstCase.grossProfit) ?? 0,
          contributionProfit: num(v.financialAnalysis.scenarios.worstCase.contributionProfit) ?? 0,
        } : { volume: 0, revenue: 0, grossProfit: 0, contributionProfit: 0 },
      } : {
        bestCase: { volume: 0, revenue: 0, grossProfit: 0, contributionProfit: 0 },
        expectedCase: { volume: 0, revenue: 0, grossProfit: 0, contributionProfit: 0 },
        worstCase: { volume: 0, revenue: 0, grossProfit: 0, contributionProfit: 0 },
      },
      hasSufficientEvidence: isObj(v.financialAnalysis.provenance) ? !!v.financialAnalysis.provenance.hasSufficientEvidence : true,
      overallConfidence: isObj(v.financialAnalysis.provenance) ? num(v.financialAnalysis.provenance.overallConfidence) ?? 1.0 : 1.0,
      missingDataItems: isObj(v.financialAnalysis.provenance) && Array.isArray(v.financialAnalysis.provenance.missingDataItems) ? v.financialAnalysis.provenance.missingDataItems as string[] : [],
      guardrailViolations: Array.isArray(v.financialAnalysis.guardrailViolations) ? v.financialAnalysis.guardrailViolations as string[] : [],
    } : undefined,
    ceoEvaluation: isObj(v.ceoEvaluation) ? {
      verdict: (['APPROVE', 'REVISE', 'REJECT', 'FURTHER_ANALYSIS_REQUIRED'].includes(str(v.ceoEvaluation.verdict) ?? '')
        ? (str(v.ceoEvaluation.verdict) as 'APPROVE' | 'REVISE' | 'REJECT' | 'FURTHER_ANALYSIS_REQUIRED')
        : 'APPROVE'),
      scores: isObj(v.ceoEvaluation.scores) ? {
        profitabilityScore: num(v.ceoEvaluation.scores.profitabilityScore) ?? 0,
        strategicValueScore: num(v.ceoEvaluation.scores.strategicValueScore) ?? 0,
        riskScore: num(v.ceoEvaluation.scores.riskScore) ?? 0,
        customerImpactScore: num(v.ceoEvaluation.scores.customerImpactScore) ?? 0,
        operationalFeasibilityScore: num(v.ceoEvaluation.scores.operationalFeasibilityScore) ?? 0,
        compositeScore: num(v.ceoEvaluation.scores.compositeScore) ?? 0,
      } : { profitabilityScore: 0, strategicValueScore: 0, riskScore: 0, customerImpactScore: 0, operationalFeasibilityScore: 0, compositeScore: 0 },
      explanation: isObj(v.ceoEvaluation.explanation) ? {
        executiveSummary: str(v.ceoEvaluation.explanation.executiveSummary) ?? '',
        evidenceSummary: str(v.ceoEvaluation.explanation.evidenceSummary) ?? '',
        tradeOffAnalysis: str(v.ceoEvaluation.explanation.tradeOffAnalysis) ?? '',
        riskEscalationTriggers: Array.isArray(v.ceoEvaluation.explanation.riskEscalationTriggers) ? v.ceoEvaluation.explanation.riskEscalationTriggers as string[] : [],
      } : { executiveSummary: '', evidenceSummary: '', tradeOffAnalysis: '', riskEscalationTriggers: [] },
      escalationRequired: !!v.ceoEvaluation.escalationRequired,
      escalationReason: str(v.ceoEvaluation.escalationReason) ?? undefined,
      advisoryDisclaimer: str(v.ceoEvaluation.advisoryDisclaimer) ?? '',
    } : undefined,
    createdAt: str(v.createdAt) ?? '',
    updatedAt: str(v.updatedAt) ?? '',
  };
}

function offerMeasurement(v: unknown): OfferMeasurementView | undefined {
  if (!isObj(v) || !str(v.offerId)) return undefined;
  const fv = isObj(v.forecastVariance) ? v.forecastVariance : {};
  return {
    offerId: v.offerId as string,
    impressions: num(v.impressions) ?? 0,
    clicks: num(v.clicks) ?? 0,
    conversions: num(v.conversions) ?? 0,
    redemptions: num(v.redemptions) ?? 0,
    conversionRatePct: num(v.conversionRatePct) ?? 0,
    totalGrossRevenue: num(v.totalGrossRevenue) ?? 0,
    totalDiscountCost: num(v.totalDiscountCost) ?? 0,
    totalNetRevenue: num(v.totalNetRevenue) ?? 0,
    totalContributionProfit: num(v.totalContributionProfit) ?? 0,
    forecastVariance: {
      predictedRedemptions: num(fv.predictedRedemptions) ?? 0,
      actualRedemptions: num(fv.actualRedemptions) ?? 0,
      varianceRedemptionsPct: num(fv.varianceRedemptionsPct) ?? 0,
      predictedRevenue: num(fv.predictedRevenue) ?? 0,
      actualRevenue: num(fv.actualRevenue) ?? 0,
      varianceRevenuePct: num(fv.varianceRevenuePct) ?? 0,
      isSignificantDrift: !!fv.isSignificantDrift,
    },
    causalConfidenceDisclaimer: str(v.causalConfidenceDisclaimer) ?? '',
  };
}

function offerOptimization(v: unknown): OfferOptimizationView | undefined {
  if (!isObj(v) || !str(v.offerId)) return undefined;
  return {
    offerId: v.offerId as string,
    action: str(v.action) ?? 'MONITOR',
    confidenceScore: num(v.confidenceScore) ?? 0,
    rationale: str(v.rationale) ?? '',
    evidencePoints: Array.isArray(v.evidencePoints) ? v.evidencePoints as string[] : [],
    requiresChairmanApproval: !!v.requiresChairmanApproval,
  };
}
