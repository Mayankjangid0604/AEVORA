'use client';
import { useState } from 'react';

const TABS = ['Dashboard', 'Objectives', 'Operating Cycle', 'Decisions', 'Recommendations'] as const;
type Tab = typeof TABS[number];

function Badge({ label, variant }: { label: string; variant?: 'advisory' | 'authoritative' | 'status' }) {
  const colors =
    variant === 'advisory' ? 'bg-blue-100 text-blue-700' :
    variant === 'authoritative' ? 'bg-red-100 text-red-700' :
    'bg-gray-100 text-gray-700';
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors}`}>{label}</span>;
}

function DashboardTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Enterprise Summary <Badge label="ADVISORY" variant="advisory" /></h2>
      <p className="text-gray-500 text-sm mb-6">Read-only aggregation from all domain phases. No domain mutations occur from this view.</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {['R&D Portfolios', 'Active Initiatives', 'Business Units', 'Capital Pools', 'Regions', 'Open Objectives', 'Pending Decisions', 'Open Escalations'].map(m => (
          <div key={m} className="border rounded p-4">
            <div className="text-xs text-gray-500">{m}</div>
            <div className="text-2xl font-bold text-gray-300">—</div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded p-4">
          <h3 className="font-medium mb-2">Pending Decisions</h3>
          <p className="text-sm text-gray-500">No pending chairman decisions.</p>
        </div>
        <div className="border rounded p-4">
          <h3 className="font-medium mb-2">Open Escalations</h3>
          <p className="text-sm text-gray-500">No open escalations.</p>
        </div>
      </div>
    </div>
  );
}

function ObjectivesTab() {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Enterprise Objectives <Badge label="ADVISORY" variant="advisory" /></h2>
        <button className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">+ New Objective</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">All objectives are advisory coordination records. They do not mutate domain data.</p>
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3 font-medium">Title</th>
            <th className="text-left p-3 font-medium">Status</th>
            <th className="text-left p-3 font-medium">Priority</th>
            <th className="text-left p-3 font-medium">Due</th>
            <th className="text-left p-3 font-medium">Approved By</th>
            <th className="text-left p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-3 text-gray-400 italic" colSpan={6}>No objectives yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OperatingCycleTab() {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Operating Cycles <Badge label="ADVISORY" variant="advisory" /></h2>
        <button className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">Open New Cycle</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Cycles flow: OPEN → REVIEWING → CLOSED. Closing a cycle only updates coordination state.</p>
      <div className="border rounded divide-y">
        <div className="p-4 text-sm text-gray-400 italic">No operating cycles yet.</div>
      </div>
      <div className="mt-6">
        <h3 className="font-medium mb-2">Escalations</h3>
        <p className="text-sm text-gray-500">Escalations are advisory status records. Resolving changes status only — no domain mutations.</p>
        <div className="mt-2 border rounded p-4 text-sm text-gray-400 italic">No escalations.</div>
      </div>
    </div>
  );
}

function DecisionsTab() {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Chairman Decisions <Badge label="AUTHORITATIVE" variant="authoritative" /></h2>
        <button className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700">+ New Decision</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Chairman decisions are authoritative records (<code>isAdvisory: false</code>). ACTIONED and DISMISSED are terminal states.
        Idempotency key ensures exactly-once creation.
      </p>
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3 font-medium">Title</th>
            <th className="text-left p-3 font-medium">Status</th>
            <th className="text-left p-3 font-medium">Priority</th>
            <th className="text-left p-3 font-medium">Created By</th>
            <th className="text-left p-3 font-medium">Decided By</th>
            <th className="text-left p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-3 text-gray-400 italic" colSpan={6}>No decisions yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RecommendationsTab() {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">AI Recommendations <Badge label="ADVISORY" variant="advisory" /></h2>
        <button className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">+ Propose</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        All recommendations are permanently advisory. Acknowledging a recommendation only records awareness — it executes nothing.
      </p>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['All', 'finance', 'workforce', 'strategy', 'product', 'rd', 'capital', 'globalops'].map(d => (
          <button key={d} className="text-xs border rounded px-2 py-1 hover:bg-gray-100">{d}</button>
        ))}
      </div>
      <div className="border rounded divide-y">
        <div className="p-4 text-sm text-gray-400 italic">No recommendations yet.</div>
      </div>
    </div>
  );
}

export default function AutonomousEnterprisePage() {
  const [tab, setTab] = useState<Tab>('Dashboard');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">Autonomous Enterprise</h1>
      <p className="text-sm text-gray-500 mb-4">Phase 40 — coordination layer. Reads all domains; never mutates domain data.</p>
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
      {tab === 'Dashboard' && <DashboardTab />}
      {tab === 'Objectives' && <ObjectivesTab />}
      {tab === 'Operating Cycle' && <OperatingCycleTab />}
      {tab === 'Decisions' && <DecisionsTab />}
      {tab === 'Recommendations' && <RecommendationsTab />}
    </div>
  );
}
