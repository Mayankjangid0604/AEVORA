'use client';
import { useState, useEffect } from 'react';

import { API_BASE as API, authHeaders } from '../lib/api';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    VALIDATING: 'bg-yellow-100 text-yellow-700',
    VALIDATED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-gray-200 text-gray-500',
    QUEUED: 'bg-blue-100 text-blue-700',
    RUNNING: 'bg-indigo-100 text-indigo-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-700',
    EXPERIMENTAL: 'bg-purple-100 text-purple-700',
    EVALUATED: 'bg-blue-100 text-blue-700',
    APPROVED: 'bg-teal-100 text-teal-700',
    PRODUCTION: 'bg-green-200 text-green-800 font-bold',
    RETIRED: 'bg-gray-200 text-gray-500',
    PASS: 'bg-green-100 text-green-700',
    FAIL: 'bg-red-100 text-red-700',
    INCONCLUSIVE: 'bg-yellow-100 text-yellow-700',
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[status] ?? 'bg-gray-100'}`}>{status}</span>;
}

function AdvisoryBadge({ isAdvisory }: { isAdvisory: boolean }) {
  return isAdvisory
    ? <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-50 text-yellow-600 border border-yellow-200">ADVISORY</span>
    : <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200">GOVERNED</span>;
}

export default function FoundationIntelligencePage() {
  const [tab, setTab] = useState('datasets');
  const [datasets, setDatasets] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [msg, setMsg] = useState('');


  async function load() {
    try {
      const [d, j, m, a, s] = await Promise.all([
        fetch(`${API}/foundation-intelligence/datasets`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API}/foundation-intelligence/training-jobs`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API}/foundation-intelligence/model-versions`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API}/foundation-intelligence/audit`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API}/foundation-intelligence/analytics/summary`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      if (Array.isArray(d)) setDatasets(d);
      if (Array.isArray(j)) setJobs(j);
      if (Array.isArray(m)) setModels(m);
      if (Array.isArray(a)) setAudit(a);
      if (s?.totalDatasets !== undefined) setSummary(s);
    } catch (e: any) { setMsg(e.message); }
  }

  useEffect(() => { load(); }, []);

  const tabs = ['datasets', 'training', 'models', 'evaluations', 'governance'];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Foundation Intelligence</h1>
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Phase 38</span>
      </div>
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Datasets', value: summary.totalDatasets, sub: `${summary.validatedDatasets} validated` },
            { label: 'Training Jobs', value: summary.totalJobs, sub: `${summary.completedJobs} completed` },
            { label: 'Models', value: summary.totalModels, sub: `${summary.productionModels} in production` },
          ].map(s => (
            <div key={s.label} className="border rounded p-4">
              <div className="text-sm text-gray-500">{s.label}</div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-400">{s.sub}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 border-b mb-4">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {msg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{msg}</div>}

      {tab === 'datasets' && (
        <div>
          <h2 className="font-semibold mb-3">Datasets</h2>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-50 text-left">
              <th className="p-2 border">Name</th>
              <th className="p-2 border">Version</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Advisory</th>
              <th className="p-2 border">Records</th>
              <th className="p-2 border">Provenance</th>
            </tr></thead>
            <tbody>{datasets.map(d => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="p-2 border">{d.name}</td>
                <td className="p-2 border">{d.version}</td>
                <td className="p-2 border"><StatusBadge status={d.status} /></td>
                <td className="p-2 border"><AdvisoryBadge isAdvisory={d.isAdvisory} /></td>
                <td className="p-2 border">{d.recordCount ?? '—'}</td>
                <td className="p-2 border text-gray-500 text-xs">{d.provenance ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'training' && (
        <div>
          <h2 className="font-semibold mb-3">Training Jobs</h2>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-50 text-left">
              <th className="p-2 border">Name</th>
              <th className="p-2 border">Type</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Advisory</th>
              <th className="p-2 border">CPU Limit</th>
              <th className="p-2 border">Mem Limit (MB)</th>
            </tr></thead>
            <tbody>{jobs.map(j => (
              <tr key={j.id} className="hover:bg-gray-50">
                <td className="p-2 border">{j.name}</td>
                <td className="p-2 border">{j.jobType}</td>
                <td className="p-2 border"><StatusBadge status={j.status} /></td>
                <td className="p-2 border"><AdvisoryBadge isAdvisory={j.isAdvisory} /></td>
                <td className="p-2 border">{j.resourceLimitCpu ?? '—'}</td>
                <td className="p-2 border">{j.resourceLimitMemMb ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'models' && (
        <div>
          <h2 className="font-semibold mb-3">Model Versions</h2>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-50 text-left">
              <th className="p-2 border">Family</th>
              <th className="p-2 border">Version</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Advisory</th>
              <th className="p-2 border">Proposed By</th>
              <th className="p-2 border">Approved By</th>
            </tr></thead>
            <tbody>{models.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="p-2 border font-medium">{m.family}</td>
                <td className="p-2 border">{m.version}</td>
                <td className="p-2 border"><StatusBadge status={m.status} /></td>
                <td className="p-2 border"><AdvisoryBadge isAdvisory={m.isAdvisory} /></td>
                <td className="p-2 border text-xs text-gray-500">{m.proposedBy?.slice(0, 8)}…</td>
                <td className="p-2 border text-xs text-gray-500">{m.approvedBy ? `${m.approvedBy.slice(0, 8)}…` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'evaluations' && (
        <div>
          <h2 className="font-semibold mb-3">Evaluations — select a model version</h2>
          <p className="text-sm text-gray-500">Navigate to a model version to view its evaluations.</p>
          {models.length > 0 && (
            <ul className="mt-3 space-y-1">{models.map(m => (
              <li key={m.id} className="text-sm flex gap-2 items-center">
                <span className="font-medium">{m.family} v{m.version}</span>
                <StatusBadge status={m.status} />
              </li>
            ))}</ul>
          )}
        </div>
      )}

      {tab === 'governance' && (
        <div className="space-y-4">
          <div className="border rounded p-4 bg-yellow-50">
            <h3 className="font-semibold mb-2">Governance Controls</h3>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>• Kill switch <code>FI_TRAINING_JOBS</code> — blocks training job starts</li>
              <li>• Kill switch <code>FI_MODEL_PROMOTION</code> — blocks APPROVED→PRODUCTION promotion</li>
              <li>• Self-promotion to PRODUCTION is blocked (proposedBy === actorId)</li>
              <li>• <code>hasSecrets=true</code> datasets cannot be used for training</li>
              <li>• Forward-only model state machine: EXPERIMENTAL→EVALUATED→APPROVED→PRODUCTION</li>
              <li>• All records are <strong>isAdvisory: true</strong> until PRODUCTION promotion</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Audit Trail</h3>
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left">
                <th className="p-2 border">Action</th>
                <th className="p-2 border">Object</th>
                <th className="p-2 border">Actor</th>
                <th className="p-2 border">At</th>
              </tr></thead>
              <tbody>{audit.slice(0, 50).map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="p-2 border text-xs font-mono">{a.action}</td>
                  <td className="p-2 border text-xs">{a.objectType} {a.objectId?.slice(0, 8)}…</td>
                  <td className="p-2 border text-xs">{a.actorId?.slice(0, 8)}…</td>
                  <td className="p-2 border text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
