'use client';

import { useState, useEffect } from 'react';
import { chairmanFetch } from '../lib/api';

export default function ResearchPage() {
  const [proposals, setProposals] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      chairmanFetch('/chairman/research/proposals'),
      chairmanFetch('/chairman/research/experiments'),
      chairmanFetch('/chairman/research/models'),
    ]).then(([prop, exp, mods]) => {
      setProposals((prop.data as any) || []);
      setExperiments((exp.data as any) || []);
      setModels((mods.data as any) || []);
      if (prop.error || exp.error || mods.error) {
        setError(prop.error || exp.error || mods.error);
      }
      setLoading(false);
    }).catch(err => {
      setError(err.message || 'Failed to load research data');
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading Research Lab...</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">AEVORA AI Research Laboratory</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="stat-card">
          <h3>Active Proposals</h3>
          <div className="stat-value">{proposals.filter((p: any) => p.status === 'SUBMITTED' || p.status === 'UNDER_REVIEW').length}</div>
        </div>
        <div className="stat-card">
          <h3>Running Experiments</h3>
          <div className="stat-value">{experiments.filter((e: any) => e.status === 'RUNNING').length}</div>
        </div>
        <div className="stat-card">
          <h3>Registered Models</h3>
          <div className="stat-value">{models.length}</div>
        </div>
      </div>

      <div className="section mb-8">
        <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Recent Proposals</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="pb-2">Title</th>
              <th className="pb-2">Risk Level</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p: any) => (
              <tr key={p.id} className="border-t border-gray-800">
                <td className="py-2">{p.title}</td>
                <td className="py-2">{p.riskLevel}</td>
                <td className="py-2">
                  <span className={`status-badge status-${p.status.toLowerCase()}`}>{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section mb-8">
        <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Recent Experiments</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="pb-2">Name</th>
              <th className="pb-2">Model Version</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {experiments.map((e: any) => (
              <tr key={e.id} className="border-t border-gray-800">
                <td className="py-2">{e.name}</td>
                <td className="py-2">{e.modelVersionId ? 'Linked' : 'None'}</td>
                <td className="py-2">
                  <span className={`status-badge status-${e.status.toLowerCase()}`}>{e.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Model Registry</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="pb-2">Family</th>
              <th className="pb-2">Provider</th>
              <th className="pb-2">Versions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m: any) => (
              <tr key={m.id} className="border-t border-gray-800">
                <td className="py-2">{m.name}</td>
                <td className="py-2">{m.provider}</td>
                <td className="py-2">{m.versions?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
