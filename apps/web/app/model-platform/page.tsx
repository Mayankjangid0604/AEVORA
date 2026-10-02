'use client';

import { useState, useEffect } from 'react';
import { API_BASE, authHeaders } from '../lib/api';

interface Provider { id: string; displayName: string; providerType: string; status: string; baseUrl?: string; createdAt: string; }
interface Model { id: string; displayName: string; modelIdentifier: string; status: string; deploymentState: string; isAdvisory: boolean; inputCostMcPerMToken?: number; outputCostMcPerMToken?: number; }
interface KillSwitch { id: string; scope: string; reason: string; isActive: boolean; createdAt: string; }

export default function ModelPlatformPage() {
  const [tab, setTab] = useState<'providers' | 'models' | 'killswitches'>('providers');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [killSwitches, setKillSwitches] = useState<KillSwitch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const api = (path: string, opts?: RequestInit) =>
    fetch(`${API_BASE}/model-platform${path}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });

  useEffect(() => {
    setLoading(true);
    setError('');
    if (tab === 'providers') {
      api('/providers').then(r => r.json()).then((d) => setProviders(Array.isArray(d) ? d : [])).catch(() => setError('Failed to load providers')).finally(() => setLoading(false));
    } else if (tab === 'models') {
      api('/models').then(r => r.json()).then((d) => setModels(Array.isArray(d) ? d : [])).catch(() => setError('Failed to load models')).finally(() => setLoading(false));
    } else {
      api('/kill-switches').then(r => r.json()).then((d) => setKillSwitches(Array.isArray(d) ? d : [])).catch(() => setError('Failed to load kill switches')).finally(() => setLoading(false));
    }
  }, [tab]);

  const statusColor = (s: string) => {
    if (s === 'ACTIVE' || s === 'DEPLOYED') return 'text-green-600 bg-green-50';
    if (s === 'DEGRADED') return 'text-yellow-600 bg-yellow-50';
    if (s === 'DISABLED' || s === 'RETIRED') return 'text-gray-500 bg-gray-50';
    return 'text-blue-600 bg-blue-50';
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Model Platform</h1>
        <p className="text-sm text-gray-500 mt-1">Advisory intelligence infrastructure — all outputs are advisory (isAdvisory: true)</p>
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {(['providers', 'models', 'killswitches'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'killswitches' ? 'Kill Switches' : t}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}

      {tab === 'providers' && !loading && (
        <div className="space-y-3">
          {providers.length === 0 && <p className="text-gray-500 text-sm">No providers registered.</p>}
          {providers.map(p => (
            <div key={p.id} className="border rounded-lg p-4 flex items-start justify-between">
              <div>
                <div className="font-medium">{p.displayName}</div>
                <div className="text-sm text-gray-500">{p.providerType}{p.baseUrl ? ` · ${p.baseUrl}` : ''}</div>
                <div className="text-xs text-gray-400 mt-1">{p.id}</div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(p.status)}`}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'models' && !loading && (
        <div className="space-y-3">
          {models.length === 0 && <p className="text-gray-500 text-sm">No models registered.</p>}
          {models.map(m => (
            <div key={m.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{m.displayName}</div>
                  <div className="text-sm text-gray-500">{m.modelIdentifier}</div>
                </div>
                <div className="flex gap-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(m.status)}`}>{m.status}</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(m.deploymentState)}`}>{m.deploymentState}</span>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                {m.inputCostMcPerMToken != null && <span>In: {m.inputCostMcPerMToken}mc/MT</span>}
                {m.outputCostMcPerMToken != null && <span>Out: {m.outputCostMcPerMToken}mc/MT</span>}
                <span className="text-blue-500">isAdvisory: {String(m.isAdvisory)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'killswitches' && !loading && (
        <div className="space-y-3">
          {killSwitches.length === 0 && <p className="text-gray-500 text-sm">No kill switches.</p>}
          {killSwitches.map(ks => (
            <div key={ks.id} className={`border rounded-lg p-4 ${ks.isActive ? 'border-red-300 bg-red-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{ks.scope}</div>
                  <div className="text-sm text-gray-600">{ks.reason}</div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${ks.isActive ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {ks.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
