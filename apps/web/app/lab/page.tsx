'use client';

import { useState } from 'react';

const TABS = ['Overview', 'Projects', 'Questions & Hypotheses', 'Experiments', 'Findings', 'Reproducibility', 'Recommendations', 'Governance'] as const;
type Tab = typeof TABS[number];

export default function ResearchLabPage() {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Research Lab</h1>
        <p className="text-sm text-gray-500 mt-1">
          Autonomous research — all outputs are advisory until explicitly authorized.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'Overview' && <OverviewTab />}
      {tab === 'Projects' && <ProjectsTab />}
      {tab === 'Questions & Hypotheses' && <QuestionsTab />}
      {tab === 'Experiments' && <ExperimentsTab />}
      {tab === 'Findings' && <FindingsTab />}
      {tab === 'Reproducibility' && <ReproducibilityTab />}
      {tab === 'Recommendations' && <RecommendationsTab />}
      {tab === 'Governance' && <GovernanceTab />}
    </div>
  );
}

function AdvisoryBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
      Advisory
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    PROPOSED: 'bg-blue-100 text-blue-700',
    APPROVED: 'bg-green-100 text-green-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    PAUSED: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-teal-100 text-teal-700',
    FAILED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
    VALIDATED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    INCONCLUSIVE: 'bg-orange-100 text-orange-700',
    ARCHIVED: 'bg-gray-200 text-gray-500',
    IMPLEMENTED: 'bg-purple-100 text-purple-700',
    SUPPORTED: 'bg-green-100 text-green-700',
    REFUTED: 'bg-red-100 text-red-700',
    TESTING: 'bg-blue-100 text-blue-700',
    QUEUED: 'bg-gray-100 text-gray-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    TIMED_OUT: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
      {message}
    </div>
  );
}

function OverviewTab() {
  const metrics = [
    { label: 'Active Projects', value: '–', sub: 'in progress' },
    { label: 'Open Hypotheses', value: '–', sub: 'under investigation' },
    { label: 'Experiments Run', value: '–', sub: 'this quarter' },
    { label: 'Validated Findings', value: '–', sub: 'advisory' },
    { label: 'Reproduced Results', value: '–', sub: 'confirmed' },
    { label: 'Recommendations', value: '–', sub: 'pending review' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SectionHeader title="Research Lab Overview" subtitle="All research outputs are advisory. Recommendations never directly mutate finance, workforce, or strategy." />
        <AdvisoryBadge />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{m.value}</div>
            <div className="text-xs font-medium text-gray-700 mt-1">{m.label}</div>
            <div className="text-xs text-gray-400">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>Governance reminder:</strong> Autonomous research does not mean unrestricted execution.
        AI reasons. Agents propose. Research services validate. Governance authorizes.
        Execution infrastructure runs approved experiments. Database records immutable evidence.
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-gray-900 text-sm">Research Pipeline</h3>
          <div className="space-y-2">
            {['Question → Hypothesis', 'Hypothesis → Evidence', 'Evidence → Experiment', 'Experiment → Result', 'Result → Evaluation', 'Evaluation → Finding', 'Finding → Reproduction', 'Reproduction → Recommendation', 'Recommendation → Strategy (advisory)'].map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium text-xs flex-shrink-0">{i + 1}</div>
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-gray-900 text-sm">Safety Boundaries</h3>
          <div className="space-y-2">
            {[
              ['✓', 'PRODUCTION environment blocked for all experiments'],
              ['✓', 'Self-validation prevented (author cannot validate own finding)'],
              ['✓', 'Self-evaluation prevented (recorder cannot evaluate own result)'],
              ['✓', 'One result per run (immutable, append-only)'],
              ['✓', 'isAdvisory=true hardcoded on all AI-generated artifacts'],
              ['✓', 'Recommendations never directly mutate ledger, payroll, or strategy'],
              ['✓', 'Research cannot grant itself financial or governance authority'],
            ].map(([icon, text], i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-green-600 flex-shrink-0">{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Research Projects" subtitle="Projects group related questions, hypotheses, experiments, and findings." />
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          New Project
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Domain</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budget</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Advisory</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No projects yet</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuestionsTab() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Questions & Hypotheses" subtitle="Research questions drive hypothesis formation. Hypotheses are always advisory until validated by a distinct actor." />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Research Questions</h3>
            <button className="text-xs text-blue-600 hover:underline">+ New Question</button>
          </div>
          <EmptyState message="No questions yet" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              Hypotheses <AdvisoryBadge />
            </h3>
            <button className="text-xs text-blue-600 hover:underline">+ Propose Hypothesis</button>
          </div>
          <EmptyState message="No hypotheses yet" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <h3 className="font-medium text-gray-900">Hypothesis lifecycle</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {['PROPOSED', '→', 'TESTING', '→', 'SUPPORTED / REFUTED / INCONCLUSIVE', '→', 'ABANDONED'].map((s, i) => (
            s === '→' ? <span key={i} className="text-gray-400">{s}</span> : <StatusPill key={i} status={s} />
          ))}
        </div>
        <p className="text-xs text-gray-500">Self-validation is prevented — the hypothesis creator cannot mark it SUPPORTED or REFUTED.</p>
      </div>
    </div>
  );
}

function ExperimentsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Experiments & Runs" subtitle="PRODUCTION environment is blocked. Experiments run in SANDBOX or STAGING only." />
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          New Experiment
        </button>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-700 flex items-center gap-2">
        <span className="font-bold">BLOCKED:</span> Experiments with environment=PRODUCTION will be rejected with 403 Forbidden.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <h3 className="font-medium text-gray-900">Run lifecycle</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {['QUEUED', '→', 'RUNNING', '→', 'COMPLETED / FAILED / TIMED_OUT / CANCELLED'].map((s, i) => (
            s === '→' ? <span key={i} className="text-gray-400">{s}</span> : <StatusPill key={i} status={s.split(' / ')[0]} />
          ))}
        </div>
        <p className="text-xs text-gray-500">Results are immutable — one result per run. Self-evaluation is prevented.</p>
      </div>

      <EmptyState message="No experiments yet" />
    </div>
  );
}

function FindingsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Findings" subtitle="Findings require peer review. Authors cannot validate their own findings." />
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          New Finding
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <h3 className="font-medium text-gray-900">Finding lifecycle</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {['DRAFT', '→', 'UNDER_REVIEW', '→', 'VALIDATED / REJECTED / INCONCLUSIVE', '→', 'ARCHIVED'].map((s, i) => (
            s === '→' ? <span key={i} className="text-gray-400">{s}</span> : <StatusPill key={i} status={s.split(' / ')[0]} />
          ))}
        </div>
        <p className="text-xs text-gray-500">Self-validation is prevented — the finding author cannot set VALIDATED or REJECTED.</p>
      </div>

      <EmptyState message="No findings yet" />
    </div>
  );
}

function ReproducibilityTab() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Reproducibility" subtitle="Record reproduction attempts to verify experiment reliability." />

      <div className="grid md:grid-cols-3 gap-4">
        {(['REPRODUCED', 'PARTIALLY_REPRODUCED', 'NOT_REPRODUCED'] as const).map((outcome) => (
          <div key={outcome} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <StatusPill status={outcome} />
            <div className="text-2xl font-bold text-gray-900 mt-2">–</div>
            <div className="text-xs text-gray-500 mt-1">{outcome.replace('_', ' ').toLowerCase()}</div>
          </div>
        ))}
      </div>

      <EmptyState message="No reproduction records yet" />
    </div>
  );
}

function RecommendationsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionHeader title="Recommendations" subtitle="Research recommendations feed into strategy — always advisory, never auto-implemented." />
          <AdvisoryBadge />
        </div>
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          New Recommendation
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800">
        Recommendations are always <strong>isAdvisory=true</strong>. They never directly mutate the financial ledger,
        employee records, or strategic plans without explicit human authorization through the appropriate domain operations.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <h3 className="font-medium text-gray-900">Recommendation lifecycle</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {['DRAFT', '→', 'PROPOSED', '→', 'ACCEPTED', '→', 'IMPLEMENTED'].map((s, i) => (
            s === '→' ? <span key={i} className="text-gray-400">{s}</span> : <StatusPill key={i} status={s} />
          ))}
        </div>
      </div>

      <EmptyState message="No recommendations yet" />
    </div>
  );
}

function GovernanceTab() {
  const boundaries = [
    { domain: 'Finance', rule: 'Cannot write to ledger, revenue, payments, bank balances, payroll, expenses' },
    { domain: 'Workforce', rule: 'Cannot mutate employee status, salary, bonus, promotion, termination, permissions' },
    { domain: 'Strategy', rule: 'Cannot approve initiatives, convert forecasts to actuals without explicit authorized operations' },
    { domain: 'Governance', rule: 'Cannot grant itself infrastructure access, financial authority, or governance authority' },
    { domain: 'Production', rule: 'Experiments blocked from environment=PRODUCTION; sandbox/staging only' },
    { domain: 'Customers', rule: 'Cannot access or mutate production customer data' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title="Research Governance" subtitle="Kill switches, domain boundaries, and audit trail." />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Domain Boundaries (enforced by service layer)</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase w-32">Domain</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Restriction</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase w-24">Enforced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {boundaries.map((b) => (
              <tr key={b.domain}>
                <td className="px-4 py-2 text-xs font-medium text-gray-700">{b.domain}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{b.rule}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center text-xs text-green-700">✓ Yes</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-red-800">Kill Switch</h3>
        <p className="text-xs text-gray-600">Disabling autonomous research requires Chairman authorization and cannot be self-authorized by the research system.</p>
        <button className="px-4 py-2 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-medium">
          Disable Autonomous Research (Chairman Only)
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-medium text-gray-900">Audit Trail</h3>
        <p className="text-xs text-gray-500">All lab operations (project creation, hypothesis transitions, experiment runs, findings, recommendations) are recorded in ManagementAuditEvent with the actor&apos;s JWT-derived identity.</p>
        <EmptyState message="No recent audit events" />
      </div>
    </div>
  );
}
