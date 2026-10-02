'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE, authHeaders } from '../lib/api';

interface Product {
  id: string; name: string; description?: string; lifecycle: string;
  ownerId: string; registeredBy: string; approvedBy?: string; category?: string;
  targetCustomer?: string; problemStatement?: string; isAdvisory: boolean; isArchived: boolean;
  createdAt: string; updatedAt: string;
  _count?: { features: number; releases: number };
}
interface Idea {
  id: string; title: string; problemStatement: string; status: string;
  originatingSource?: string; isAdvisory: boolean; createdAt: string;
}
interface Release { id: string; versionRef: string; environment: string; releasedAt?: string; notes?: string; isAdvisory: boolean; }
interface Launch { id: string; status: string; approvedBy?: string; launchedAt?: string; rollbackReason?: string; isAdvisory: boolean; }
interface AuditEvent { id: string; actorId: string; action: string; objectType?: string; objectId?: string; createdAt: string; }
interface PortfolioHealth { isAdvisory: boolean; totalProducts: number; byLifecycle: Record<string, number>; activeCount: number; launchedCount: number; }

type Tab = 'portfolio' | 'ideas' | 'products' | 'governance';

const LIFECYCLE_COLORS: Record<string, string> = {
  IDEA: 'bg-gray-100 text-gray-700',
  VALIDATING: 'bg-yellow-50 text-yellow-700',
  VALIDATED: 'bg-yellow-100 text-yellow-800',
  PLANNING: 'bg-blue-50 text-blue-700',
  IN_DEVELOPMENT: 'bg-blue-100 text-blue-800',
  TESTING: 'bg-purple-50 text-purple-700',
  SECURITY_REVIEW: 'bg-orange-50 text-orange-700',
  AWAITING_APPROVAL: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  RELEASED: 'bg-emerald-100 text-emerald-800',
  LAUNCHED: 'bg-green-100 text-green-800',
  ACTIVE: 'bg-green-200 text-green-900',
  DEPRECATED: 'bg-red-50 text-red-700',
  RETIRED: 'bg-gray-200 text-gray-600',
};

const LIFECYCLE_NEXT: Record<string, string> = {
  IDEA: 'VALIDATING',
  VALIDATING: 'VALIDATED',
  VALIDATED: 'PLANNING',
  PLANNING: 'IN_DEVELOPMENT',
  IN_DEVELOPMENT: 'TESTING',
  TESTING: 'SECURITY_REVIEW',
  SECURITY_REVIEW: 'AWAITING_APPROVAL',
  AWAITING_APPROVAL: 'APPROVED',
  APPROVED: 'RELEASED',
  RELEASED: 'LAUNCHED',
  LAUNCHED: 'ACTIVE',
  ACTIVE: 'DEPRECATED',
  DEPRECATED: 'RETIRED',
};

export default function ProductFactoryPage() {
  const [tab, setTab] = useState<Tab>('portfolio');
  const [products, setProducts] = useState<Product[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [health, setHealth] = useState<PortfolioHealth | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', problemStatement: '', targetCustomer: '', category: '' });
  const [ideaForm, setIdeaForm] = useState({ title: '', problemStatement: '', proposedSolution: '', originatingSource: '' });

  const api = (path: string, opts?: RequestInit) =>
    fetch(`${API_BASE}/product-factory${path}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });

  const loadProducts = useCallback(() => {
    setLoading(true);
    Promise.all([
      api('/products').then(r => r.json()),
      api('/portfolio/health').then(r => r.json()),
    ]).then(([prods, h]) => { setProducts(Array.isArray(prods) ? prods : []); setHealth(h?.byLifecycle ? h : null); })
      .catch(() => setError('Failed to load products'))
      .finally(() => setLoading(false));
  }, []);

  const loadIdeas = useCallback(() => {
    setLoading(true);
    api('/ideas').then(r => r.json()).then(data => setIdeas(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load ideas')).finally(() => setLoading(false));
  }, []);

  const loadAudit = useCallback(() => {
    api('/audit').then(r => r.json()).then(data => setAudit(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setError('');
    if (tab === 'portfolio' || tab === 'products') loadProducts();
    if (tab === 'ideas') loadIdeas();
    if (tab === 'governance') loadAudit();
  }, [tab, loadProducts, loadIdeas, loadAudit]);

  const selectProduct = (p: Product) => {
    setSelected(p);
    setTab('products');
    Promise.all([
      api(`/products/${p.id}/releases`).then(r => r.json()),
      api(`/products/${p.id}/launches`).then(r => r.json()),
    ]).then(([r, l]) => { setReleases(Array.isArray(r) ? r : []); setLaunches(Array.isArray(l) ? l : []); }).catch(() => {});
  };

  const advanceLifecycle = async (productId: string, lifecycle: string) => {
    await api(`/products/${productId}/lifecycle`, { method: 'PATCH', body: JSON.stringify({ lifecycle }) });
    loadProducts();
  };

  const createProduct = async () => {
    if (!form.name.trim()) return;
    await api('/products', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', description: '', problemStatement: '', targetCustomer: '', category: '' });
    setShowNewProduct(false);
    loadProducts();
  };

  const createIdea = async () => {
    if (!ideaForm.title.trim() || !ideaForm.problemStatement.trim()) return;
    await api('/ideas', { method: 'POST', body: JSON.stringify(ideaForm) });
    setIdeaForm({ title: '', problemStatement: '', proposedSolution: '', originatingSource: '' });
    setShowNewIdea(false);
    loadIdeas();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'products', label: 'Products' },
    { id: 'governance', label: 'Governance' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Product Factory</h1>
        <p className="text-sm text-gray-500 mt-1">
          Autonomous Product Factory — governed lifecycle from idea to retirement.{' '}
          <span className="text-blue-600 font-medium">All AI outputs are advisory (isAdvisory: true)</span>
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error}</div>}

      {/* Portfolio */}
      {tab === 'portfolio' && !loading && (
        <div>
          {health && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Products', value: health.totalProducts },
                { label: 'Active', value: health.activeCount },
                { label: 'Launched', value: health.launchedCount },
                { label: 'In Development', value: health.byLifecycle['IN_DEVELOPMENT'] ?? 0 },
              ].map(m => (
                <div key={m.label} className="border rounded-lg p-4 bg-white">
                  <div className="text-2xl font-bold text-gray-900">{m.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          )}
          {health && (
            <div className="border rounded-lg p-4 mb-6 bg-blue-50">
              <div className="text-xs font-medium text-blue-700 mb-2">ADVISORY — Portfolio by Lifecycle</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(health.byLifecycle ?? {}).map(([lc, count]) => (
                  <span key={lc} className={`text-xs px-2 py-1 rounded font-medium ${LIFECYCLE_COLORS[lc] ?? 'bg-gray-100 text-gray-600'}`}>
                    {lc}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Products</h2>
            <button onClick={() => setShowNewProduct(true)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">+ New Product</button>
          </div>
          {showNewProduct && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input className="border rounded px-3 py-2 text-sm" placeholder="Product name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <input className="border rounded px-3 py-2 text-sm" placeholder="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                <input className="border rounded px-3 py-2 text-sm col-span-2" placeholder="Problem statement" value={form.problemStatement} onChange={e => setForm(f => ({ ...f, problemStatement: e.target.value }))} />
                <input className="border rounded px-3 py-2 text-sm" placeholder="Target customer" value={form.targetCustomer} onChange={e => setForm(f => ({ ...f, targetCustomer: e.target.value }))} />
                <input className="border rounded px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button onClick={createProduct} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">Create</button>
                <button onClick={() => setShowNewProduct(false)} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {products.length === 0 && <p className="text-gray-500 text-sm">No products yet.</p>}
            {products.map(p => (
              <div key={p.id} className="border rounded-lg p-4 bg-white hover:shadow-sm cursor-pointer" onClick={() => selectProduct(p)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{p.name}</div>
                    {p.description && <div className="text-sm text-gray-500 mt-0.5">{p.description}</div>}
                    {p.targetCustomer && <div className="text-xs text-gray-400 mt-1">Target: {p.targetCustomer}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${LIFECYCLE_COLORS[p.lifecycle] ?? 'bg-gray-100'}`}>{p.lifecycle}</span>
                    {p.isAdvisory && <span className="text-xs text-blue-500">advisory</span>}
                  </div>
                </div>
                {p._count && (
                  <div className="mt-2 flex gap-4 text-xs text-gray-400">
                    <span>{p._count.features} features</span>
                    <span>{p._count.releases} releases</span>
                  </div>
                )}
                {LIFECYCLE_NEXT[p.lifecycle] && (
                  <button
                    onClick={e => { e.stopPropagation(); advanceLifecycle(p.id, LIFECYCLE_NEXT[p.lifecycle]); }}
                    className="mt-2 text-xs text-blue-600 hover:underline">
                    Advance → {LIFECYCLE_NEXT[p.lifecycle]}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ideas */}
      {tab === 'ideas' && !loading && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Product Ideas</h2>
            <button onClick={() => setShowNewIdea(true)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">+ New Idea</button>
          </div>
          {showNewIdea && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input className="border rounded px-3 py-2 text-sm col-span-2" placeholder="Idea title *" value={ideaForm.title} onChange={e => setIdeaForm(f => ({ ...f, title: e.target.value }))} />
                <textarea className="border rounded px-3 py-2 text-sm col-span-2" rows={2} placeholder="Problem statement *" value={ideaForm.problemStatement} onChange={e => setIdeaForm(f => ({ ...f, problemStatement: e.target.value }))} />
                <input className="border rounded px-3 py-2 text-sm" placeholder="Proposed solution" value={ideaForm.proposedSolution} onChange={e => setIdeaForm(f => ({ ...f, proposedSolution: e.target.value }))} />
                <input className="border rounded px-3 py-2 text-sm" placeholder="Originating source (e.g. customer, AI)" value={ideaForm.originatingSource} onChange={e => setIdeaForm(f => ({ ...f, originatingSource: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button onClick={createIdea} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">Create</button>
                <button onClick={() => setShowNewIdea(false)} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {ideas.length === 0 && <p className="text-gray-500 text-sm">No ideas yet.</p>}
            {ideas.map(idea => (
              <div key={idea.id} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{idea.title}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{idea.problemStatement}</div>
                    {idea.originatingSource && (
                      <div className={`text-xs mt-1 ${idea.originatingSource.toLowerCase().includes('ai') ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                        Source: {idea.originatingSource}
                        {idea.originatingSource.toLowerCase().includes('ai') && ' [AI-GENERATED — advisory]'}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    idea.status === 'VALIDATED' ? 'bg-green-100 text-green-700' :
                    idea.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                    idea.status === 'CONVERTED' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{idea.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Detail */}
      {tab === 'products' && !loading && (
        <div>
          {!selected ? (
            <div>
              <p className="text-gray-500 text-sm mb-4">Select a product from Portfolio to view details.</p>
              <div className="space-y-3">
                {products.map(p => (
                  <div key={p.id} className="border rounded-lg p-4 bg-white cursor-pointer hover:shadow-sm" onClick={() => selectProduct(p)}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className={`text-xs px-2 py-1 rounded ${LIFECYCLE_COLORS[p.lifecycle] ?? 'bg-gray-100'}`}>{p.lifecycle}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button onClick={() => setSelected(null)} className="text-sm text-blue-600 hover:underline mb-4">← Back to list</button>
              <div className="bg-white border rounded-lg p-6 mb-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selected.name}</h2>
                    {selected.description && <p className="text-gray-600 text-sm mt-1">{selected.description}</p>}
                  </div>
                  <span className={`text-sm font-medium px-3 py-1.5 rounded ${LIFECYCLE_COLORS[selected.lifecycle] ?? 'bg-gray-100'}`}>{selected.lifecycle}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selected.problemStatement && (
                    <div className="col-span-2">
                      <span className="font-medium text-gray-700">Problem: </span>
                      <span className="text-gray-600">{selected.problemStatement}</span>
                    </div>
                  )}
                  {selected.targetCustomer && <div><span className="font-medium text-gray-700">Target: </span><span className="text-gray-600">{selected.targetCustomer}</span></div>}
                  {selected.category && <div><span className="font-medium text-gray-700">Category: </span><span className="text-gray-600">{selected.category}</span></div>}
                  {selected.approvedBy && <div><span className="font-medium text-gray-700">Approved by: </span><span className="text-gray-600 font-mono text-xs">{selected.approvedBy}</span></div>}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded">AUTHORITATIVE</span>
                  {selected.isAdvisory && <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded">ADVISORY</span>}
                </div>
              </div>

              {/* Releases */}
              <div className="mb-4">
                <h3 className="text-base font-semibold mb-2">Releases</h3>
                {releases.length === 0 ? <p className="text-gray-400 text-sm">No releases.</p> : (
                  <div className="space-y-2">
                    {releases.map(r => (
                      <div key={r.id} className="border rounded p-3 text-sm flex justify-between items-center">
                        <div>
                          <span className="font-medium">v{r.versionRef}</span>
                          {r.notes && <span className="text-gray-500 ml-2">{r.notes}</span>}
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${r.environment === 'PRODUCTION' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{r.environment}</span>
                          {r.isAdvisory && <span className="text-xs text-blue-500">advisory</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Launches */}
              <div>
                <h3 className="text-base font-semibold mb-2">Launches</h3>
                {launches.length === 0 ? <p className="text-gray-400 text-sm">No launches.</p> : (
                  <div className="space-y-2">
                    {launches.map(l => (
                      <div key={l.id} className={`border rounded p-3 text-sm flex justify-between items-center ${l.status === 'LAUNCHED' ? 'border-green-300 bg-green-50' : l.status === 'ROLLED_BACK' ? 'border-red-300 bg-red-50' : ''}`}>
                        <div>
                          <span className={`font-medium ${l.status === 'LAUNCHED' ? 'text-green-700' : l.status === 'ROLLED_BACK' ? 'text-red-700' : 'text-gray-700'}`}>{l.status}</span>
                          {l.rollbackReason && <span className="text-gray-500 ml-2 text-xs">Reason: {l.rollbackReason}</span>}
                        </div>
                        {l.isAdvisory && <span className="text-xs text-blue-500">advisory</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Governance */}
      {tab === 'governance' && !loading && (
        <div>
          <div className="border rounded-lg p-4 bg-amber-50 border-amber-200 mb-6">
            <div className="font-medium text-amber-800">Constitutional Boundaries Active</div>
            <div className="text-sm text-amber-700 mt-1 space-y-1">
              <div>• AI agents cannot approve their own products, releases, or security findings</div>
              <div>• Production releases require QA evidence + security clearance</div>
              <div>• Finance, Workforce, Strategy data is read-only from Product Factory</div>
              <div>• All AI-generated artifacts are marked <code className="bg-amber-100 px-1 rounded">isAdvisory: true</code></div>
              <div>• Kill switches: PF_AUTOMATED_RELEASE, PF_AUTOMATED_LAUNCH</div>
            </div>
          </div>
          <h3 className="text-base font-semibold mb-3">Audit Trail</h3>
          <div className="space-y-2">
            {audit.length === 0 && <p className="text-gray-500 text-sm">No audit events.</p>}
            {audit.map(e => (
              <div key={e.id} className="border rounded p-3 text-xs text-gray-600 flex justify-between">
                <div>
                  <span className="font-mono text-blue-700">{e.action}</span>
                  {e.objectType && <span className="ml-2 text-gray-500">{e.objectType}</span>}
                  {e.objectId && <span className="ml-1 font-mono text-gray-400">{e.objectId.slice(0, 8)}…</span>}
                </div>
                <div className="text-gray-400">{new Date(e.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
