'use client';
import { useState } from 'react';

const TABS = ['Portfolio', 'Initiatives', 'Capabilities', 'Feedback', 'Analytics'] as const;
type Tab = typeof TABS[number];

export default function RdFlywheelPage() {
  const [tab, setTab] = useState<Tab>('Portfolio');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">R&amp;D Flywheel</h1>
      <div className="flex gap-2 border-b mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Portfolio' && <PortfolioTab />}
      {tab === 'Initiatives' && <InitiativesTab />}
      {tab === 'Capabilities' && <CapabilitiesTab />}
      {tab === 'Feedback' && <FeedbackTab />}
      {tab === 'Analytics' && <AnalyticsTab />}
    </div>
  );
}

function PortfolioTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Portfolios</h2>
      <p className="text-sm text-gray-500">
        R&D portfolios group related initiatives. Portfolios are authoritative (isAdvisory: false).
      </p>
      <table className="mt-4 w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left border-b">Name</th>
            <th className="p-2 text-left border-b">Status</th>
            <th className="p-2 text-left border-b">Initiatives</th>
            <th className="p-2 text-left border-b">Owner</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-400 text-center">
            <td colSpan={4} className="p-4">Connect to /rd-flywheel/portfolios to load data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InitiativesTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Initiatives</h2>
      <p className="text-sm text-gray-500 mb-4">
        Workflow: PROPOSED → APPROVED → IN_PROGRESS → COMPLETED. Self-approval blocked.
      </p>
      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left border-b">Title</th>
            <th className="p-2 text-left border-b">Status</th>
            <th className="p-2 text-left border-b">Priority</th>
            <th className="p-2 text-left border-b">Est. Cost (mc)</th>
            <th className="p-2 text-left border-b">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-400 text-center">
            <td colSpan={5} className="p-4">Connect to /rd-flywheel/initiatives to load data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CapabilitiesTab() {
  const maturities = ['NONE', 'EMERGING', 'DEVELOPING', 'MATURE', 'LEADING'];
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Capability Maturity</h2>
      <div className="flex gap-2 mb-4">
        {maturities.map(m => (
          <span key={m} className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200">{m}</span>
        ))}
      </div>
      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left border-b">Name</th>
            <th className="p-2 text-left border-b">Domain</th>
            <th className="p-2 text-left border-b">Maturity</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-400 text-center">
            <td colSpan={3} className="p-4">Connect to /rd-flywheel/capabilities to load data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FeedbackTab() {
  const types = ['PRODUCT_OUTCOME', 'CUSTOMER_INSIGHT', 'MODEL_PERFORMANCE', 'RESEARCH_FINDING', 'MARKET_SIGNAL'];
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Feedback Items</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {types.map(t => (
          <span key={t} className="px-2 py-1 text-xs rounded bg-green-50 text-green-700 border border-green-200">{t.replace(/_/g, ' ')}</span>
        ))}
      </div>
      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left border-b">Type</th>
            <th className="p-2 text-left border-b">Summary</th>
            <th className="p-2 text-left border-b">Initiative</th>
            <th className="p-2 text-left border-b">Submitted By</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-400 text-center">
            <td colSpan={4} className="p-4">Connect to /rd-flywheel/feedback to load data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Flywheel Analytics</h2>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
        Advisory data only — not authoritative Finance records.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {['Total Portfolios', 'Active Initiatives', 'Completed Initiatives', 'Total Capabilities'].map(label => (
          <div key={label} className="border rounded p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">—</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
      <h3 className="font-semibold text-sm mb-2">Resource Plans</h3>
      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left border-b">Portfolio</th>
            <th className="p-2 text-left border-b">Fiscal Year</th>
            <th className="p-2 text-left border-b">Quarter</th>
            <th className="p-2 text-left border-b">Allocated (mc)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-400 text-center">
            <td colSpan={4} className="p-4">Connect to /rd-flywheel/resource-plans to load data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
