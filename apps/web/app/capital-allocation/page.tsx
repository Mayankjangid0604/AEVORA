'use client';
import { useState } from 'react';

const TABS = ['Portfolio', 'Proposals', 'Allocations', 'Performance', 'Audit'] as const;
type Tab = typeof TABS[number];

const AdvisoryBadge = () => (
  <span className="inline-block px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 border border-yellow-300 ml-2">
    Advisory
  </span>
);
const AuthoritativeBadge = () => (
  <span className="inline-block px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800 border border-blue-300 ml-2">
    Authoritative
  </span>
);

export default function CapitalAllocationPage() {
  const [tab, setTab] = useState<Tab>('Portfolio');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Capital Allocation</h1>
      <p className="text-sm text-gray-500 mb-4">
        Phase 36 — Autonomous Capital Allocation.
        <AdvisoryBadge /> = advisory reference only.{' '}
        <AuthoritativeBadge /> = governance record.
        Finance remains the authoritative ledger.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 border-b mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Portfolio' && (
        <div>
          <div className="flex gap-3 mb-4 items-center">
            <label className="text-sm font-medium">Fiscal Year:</label>
            <input
              type="number"
              value={fiscalYear}
              onChange={e => setFiscalYear(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm w-24"
            />
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total Pools', value: '—' },
              { label: 'Total Capital (advisory)', value: '—' },
              { label: 'Available (advisory)', value: '—' },
            ].map(c => (
              <div key={c.label} className="border rounded p-4 bg-gray-50">
                <div className="text-xs text-gray-500">{c.label}<AdvisoryBadge /></div>
                <div className="text-2xl font-bold mt-1">{c.value}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 italic">
            Connect to <code>GET /capital-allocation/pools?fiscalYear={fiscalYear}</code> to populate.
          </p>
        </div>
      )}

      {tab === 'Proposals' && (
        <div>
          <div className="mb-4 p-4 border rounded bg-yellow-50">
            <h3 className="font-medium text-sm mb-1">Create Proposal <AdvisoryBadge /></h3>
            <p className="text-xs text-gray-500">
              Proposals are advisory records. Use <code>POST /capital-allocation/proposals</code>.
              Workflow: DRAFT → SUBMITTED → ANALYZING → APPROVED/REJECTED.
              Self-approval is blocked. Kill switch: <code>CA_PROPOSAL_APPROVAL=enabled</code> required.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Title', 'Category', 'Requested (mc)', 'Status', 'Advisory', 'Actions'].map(h => (
                    <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={6} className="border px-3 py-4 text-gray-400 text-center">No proposals loaded — connect API</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Allocations' && (
        <div>
          <div className="mb-4 p-4 border rounded bg-blue-50">
            <h3 className="font-medium text-sm mb-1">Authorized Allocations <AuthoritativeBadge /></h3>
            <p className="text-xs text-gray-500">
              Authorized allocations are <strong>authoritative governance records</strong> (isAdvisory=false).
              Self-authorization blocked. Kill switch: <code>CA_ALLOCATION_EXECUTION=enabled</code> required.
              Finance remains the authoritative ledger — no Finance writes occur here.
              <code>financeRef</code> is an advisory string reference only.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Proposal', 'Amount (mc)', 'Status', 'Authorized By', 'Finance Ref', 'Actions'].map(h => (
                    <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={6} className="border px-3 py-4 text-gray-400 text-center">No allocations loaded — connect API</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Performance' && (
        <div>
          <div className="mb-4 p-4 border rounded bg-yellow-50">
            <h3 className="font-medium text-sm mb-1">Performance Records <AdvisoryBadge /></h3>
            <p className="text-xs text-gray-500">
              Realized vs expected returns by allocation period.
              Advisory only — Finance is the authoritative source for actual returns.
              All monetary values in integer microcents.
            </p>
          </div>
          <p className="text-sm text-gray-500 italic">Connect to <code>GET /capital-allocation/allocations/:id/performance</code>.</p>
        </div>
      )}

      {tab === 'Audit' && (
        <div>
          <div className="mb-4 p-4 border rounded bg-gray-50">
            <h3 className="font-medium text-sm mb-1">Audit Trail</h3>
            <p className="text-xs text-gray-500">
              Append-only. No deletes, no updates. Scoped to tenant.
              Connect to <code>GET /capital-allocation/audit</code>.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Timestamp', 'Actor', 'Action', 'Object', 'Object ID'].map(h => (
                    <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={5} className="border px-3 py-4 text-gray-400 text-center">No audit events — connect API</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
