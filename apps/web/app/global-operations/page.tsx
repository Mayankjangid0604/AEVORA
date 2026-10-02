'use client';

import { useState } from 'react';

const TABS = ['Structure', 'Operations', 'Finance', 'Governance', 'Analytics'] as const;
type Tab = typeof TABS[number];

const AdvisoryBadge = () => (
  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full border border-amber-300">
    Advisory
  </span>
);

const AuthoritativeBadge = () => (
  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full border border-blue-300">
    Authoritative
  </span>
);

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PLANNING: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-orange-100 text-orange-800',
    CLOSING: 'bg-red-100 text-red-800',
    CLOSED: 'bg-gray-100 text-gray-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

const EntityTypeBadge = ({ type }: { type: string }) => (
  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
    {type.replace(/_/g, ' ')}
  </span>
);

// ─── Mock data for display ────────────────────────────────────────────────────

const mockRegions = [
  { id: '1', name: 'Europe, Middle East & Africa', code: 'EMEA', status: 'ACTIVE', currency: 'EUR', isAdvisory: false },
  { id: '2', name: 'Asia Pacific', code: 'APAC', status: 'ACTIVE', currency: 'USD', isAdvisory: false },
  { id: '3', name: 'Americas', code: 'AMER', status: 'ACTIVE', currency: 'USD', isAdvisory: false },
];

const mockEntities = [
  { id: '1', name: 'AEVORA GmbH', code: 'DE-001', entityType: 'SUBSIDIARY', status: 'ACTIVE', region: 'EMEA', isAdvisory: false },
  { id: '2', name: 'AEVORA Singapore Pte Ltd', code: 'SG-001', entityType: 'SUBSIDIARY', status: 'ACTIVE', region: 'APAC', isAdvisory: false },
  { id: '3', name: 'AEVORA Inc (HQ)', code: 'US-HQ', entityType: 'HEADQUARTERS', status: 'ACTIVE', region: 'AMER', isAdvisory: false },
  { id: '4', name: 'AEVORA Brazil Rep Office', code: 'BR-001', entityType: 'REPRESENTATIVE_OFFICE', status: 'PLANNING', region: 'AMER', isAdvisory: false },
];

const mockKpis = [
  { id: '1', name: 'Revenue Growth', currentValue: '18%', targetValue: '25%', period: '2026-Q3', region: 'EMEA', isAdvisory: true },
  { id: '2', name: 'Headcount', currentValue: '42', targetValue: '60', period: '2026-Q3', region: 'APAC', isAdvisory: true },
];

const mockRisks = [
  { id: '1', title: 'GDPR Compliance Gap', riskLevel: 'HIGH', status: 'OPEN', category: 'REGULATORY', region: 'EMEA', isAdvisory: true },
  { id: '2', title: 'FX Volatility', riskLevel: 'MEDIUM', status: 'MITIGATED', category: 'FX', region: 'APAC', isAdvisory: true },
];

const mockBudgets = [
  { id: '1', fiscalYear: 2026, fiscalQuarter: 3, allocatedMc: 50000000000, region: 'EMEA', currency: 'EUR', isAdvisory: true },
  { id: '2', fiscalYear: 2026, fiscalQuarter: 3, allocatedMc: 38000000000, region: 'APAC', currency: 'USD', isAdvisory: true },
];

const mockFxRates = [
  { id: '1', fromCurrency: 'EUR', toCurrency: 'USD', rateMc: 108500, effectiveAt: '2026-09-20', source: 'ECB', isAdvisory: true },
  { id: '2', fromCurrency: 'SGD', toCurrency: 'USD', rateMc: 74100, effectiveAt: '2026-09-20', source: 'MAS', isAdvisory: true },
];

const mockCompliance = [
  { id: '1', framework: 'GDPR', status: 'UNDER_REVIEW', entity: 'AEVORA GmbH', dueDate: '2026-12-31', isAdvisory: true },
  { id: '2', framework: 'SOX', status: 'COMPLIANT', entity: 'AEVORA Inc (HQ)', isAdvisory: true },
];

const mockAnalytics = {
  isAdvisory: true,
  totalRegions: 3,
  totalEntities: 4,
  activeEntities: 3,
  totalRisks: 2,
  openRisks: 1,
};

// ─── Tab panels ──────────────────────────────────────────────────────────────

function StructureTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Global Structure</h2>
        <AuthoritativeBadge />
        <span className="text-xs text-gray-500">Regions, Countries & Entities are authoritative records</span>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Regions</h3>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Record Type</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockRegions.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{r.code}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.currency}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3"><AuthoritativeBadge /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Operating Entities</h3>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockEntities.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{e.code}</td>
                  <td className="px-4 py-3"><EntityTypeBadge type={e.entityType} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{e.region}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OperationsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Regional Operations</h2>
        <AdvisoryBadge />
        <span className="text-xs text-gray-500">KPIs and risks are advisory references</span>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Regional KPIs <AdvisoryBadge /></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockKpis.map(k => (
            <div key={k.id} className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium text-gray-900">{k.name}</span>
                <AdvisoryBadge />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>Current: <span className="font-mono font-medium">{k.currentValue}</span></div>
                <div>Target: <span className="font-mono font-medium">{k.targetValue}</span></div>
                <div>Period: {k.period}</div>
                <div>Region: {k.region}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Regional Risks <AdvisoryBadge /></h3>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockRisks.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.title}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.riskLevel === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {r.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.category}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.region}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceTab() {
  const fmtMc = (mc: number) => `$${(mc / 1_000_000_00).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
        <div className="flex items-center gap-2">
          <AdvisoryBadge />
          <span className="text-sm font-medium text-amber-900">Finance is the authoritative source for all monetary data.</span>
        </div>
        <p className="mt-1 text-xs text-amber-700">Regional budgets and FX rates shown here are advisory references only. Do not use them for accounting, reporting, or financial settlement.</p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Regional Budgets <AdvisoryBadge /></h3>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allocated (advisory)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockBudgets.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{b.region}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.fiscalYear} Q{b.fiscalQuarter}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{fmtMc(b.allocatedMc)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">FX Reference Rates <AdvisoryBadge /></h3>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pair</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate (×100000)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockFxRates.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{r.fromCurrency}/{r.toCurrency}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{r.rateMc}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.effectiveAt}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GovernanceTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Governance</h2>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Entity Approvals</h3>
        <div className="space-y-3">
          {mockEntities.filter(e => e.status === 'PLANNING').map(e => (
            <div key={e.id} className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-medium text-gray-900">{e.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{e.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.status} />
                  <AuthoritativeBadge />
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-600">Awaiting approval — self-approval is blocked by policy</p>
            </div>
          ))}
          {mockEntities.filter(e => e.status !== 'PLANNING').length > 0 && (
            <p className="text-xs text-gray-500">{mockEntities.filter(e => e.status !== 'PLANNING').length} entities approved</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Compliance Records <AdvisoryBadge /></h3>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Framework</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockCompliance.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{c.entity}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{c.framework}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'COMPLIANT' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{(c as any).dueDate ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const a = mockAnalytics;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
        <AdvisoryBadge />
        <span className="text-xs text-gray-500">All analytics are advisory aggregations</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Regions', value: a.totalRegions, auth: true },
          { label: 'Total Entities', value: a.totalEntities, auth: true },
          { label: 'Active Entities', value: a.activeEntities, auth: true },
          { label: 'Total Risks', value: a.totalRisks, advisory: true },
          { label: 'Open Risks', value: a.openRisks, advisory: true },
        ].map(stat => (
          <div key={stat.label} className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-gray-500">{stat.label}</span>
              {stat.advisory ? <AdvisoryBadge /> : <AuthoritativeBadge />}
            </div>
            <span className="text-2xl font-bold text-gray-900">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Regional Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {mockRegions.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-900">{r.code}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>KPIs: {mockKpis.filter(k => k.region === r.code).length}</div>
                <div>Risks: {mockRisks.filter(k => k.region === r.code).length}</div>
                <div>Entities: {mockEntities.filter(e => e.region === r.code).length}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
          <AdvisoryBadge /> Regional health data is advisory — Finance is authoritative for monetary metrics.
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GlobalOperationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Structure');

  const TAB_COMPONENTS: Record<Tab, JSX.Element> = {
    Structure: <StructureTab />,
    Operations: <OperationsTab />,
    Finance: <FinanceTab />,
    Governance: <GovernanceTab />,
    Analytics: <AnalyticsTab />,
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Global Operations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage regions, operating entities, compliance, and advisory metrics across your global footprint.
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><AuthoritativeBadge /> Structural records (regions, entities)</span>
            <span className="flex items-center gap-1"><AdvisoryBadge /> Advisory metrics (KPIs, risks, budgets, FX)</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>
          <div className="p-6">
            {TAB_COMPONENTS[activeTab]}
          </div>
        </div>
      </div>
    </div>
  );
}
