'use client';

import { useState, useEffect } from 'react';
import { chairmanFetch } from '../lib/api';
import PixelContent from '../components/PixelContent';

type Tab = 'pixel' | 'overview' | 'brand' | 'audiences' | 'campaigns' | 'content' | 'calendar' | 'analytics';

interface Metric {
  label: string;
  value: string | number;
  note?: string;
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pixel');
  const [metrics, setMetrics] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [content, setContent] = useState<any[]>([]);
  const [brand, setBrand] = useState<any>(null);
  const [personas, setPersonas] = useState<any[]>([]);

  useEffect(() => {
    chairmanFetch('/marketing/analytics/metrics').then(r => r.data ? setMetrics(r.data) : null).catch(() => {});
    chairmanFetch('/marketing/campaigns').then(r => r.data ? setCampaigns(r.data) : null).catch(() => {});
    chairmanFetch('/marketing/content').then(r => r.data ? setContent(r.data) : null).catch(() => {});
    chairmanFetch('/marketing/brand').then(r => r.data ? setBrand(r.data) : null).catch(() => {});
    chairmanFetch('/marketing/personas').then(r => r.data ? setPersonas(r.data) : null).catch(() => {});
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pixel', label: 'PIXEL Content' },
    { id: 'overview', label: 'Overview' },
    { id: 'brand', label: 'Brand' },
    { id: 'audiences', label: 'Audiences' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'content', label: 'Content' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'analytics', label: 'Analytics' },
  ];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'var(--text-3)', REVIEW: 'var(--warning)', APPROVED: 'var(--success)', ACTIVE: 'var(--success)',
      PUBLISHED: 'var(--info)', SCHEDULED: 'var(--accent)', PAUSED: 'var(--warning)',
      COMPLETED: 'var(--text-2)', CANCELLED: 'var(--danger)', REJECTED: 'var(--danger)',
    };
    return colors[status] ?? 'var(--text-3)';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Marketing & Brand</h1>
        <p className="page-desc">Autonomous marketing operations — governed by approval workflow</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
              background: activeTab === t.id ? 'var(--accent)' : 'var(--surface)',
              color: activeTab === t.id ? '#fff' : 'var(--text-2)',
              fontWeight: activeTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'pixel' && <PixelContent />}

      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Impressions', value: metrics?.totalImpressions ?? '—', note: 'Observed only' },
              { label: 'Total Clicks', value: metrics?.totalClicks ?? '—', note: 'Observed only' },
              { label: 'Active Campaigns', value: metrics?.activeCampaigns ?? '—' },
              { label: 'Published Content', value: metrics?.publishedContent ?? '—' },
            ].map((m: Metric) => (
              <div key={m.label} style={{ background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{m.value}</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{m.label}</div>
                {m.note && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{m.note}</div>}
              </div>
            ))}
          </div>
          {metrics?.analyticsDisclaimer && (
            <div style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16 }}>
              {metrics.analyticsDisclaimer}
            </div>
          )}
          {metrics?.forecastDisclaimer && (
            <div style={{ background: 'var(--info-subtle)', border: '1px solid var(--accent)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13 }}>
              ℹ️ {metrics.forecastDisclaimer}
            </div>
          )}
        </div>
      )}

      {activeTab === 'brand' && (
        <div>
          {brand ? (
            <div style={{ background: 'var(--surface)', padding: 20, borderRadius: 'var(--radius)' }}>
              <h2 style={{ marginTop: 0 }}>{brand.brandName}</h2>
              {brand.positioning && <p><strong>Positioning:</strong> {brand.positioning}</p>}
              {brand.mission && <p><strong>Mission:</strong> {brand.mission}</p>}
              {brand.tone && <p><strong>Tone:</strong> {brand.tone}</p>}
              {brand.voice && <p><strong>Voice:</strong> {brand.voice}</p>}
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Version {brand.version} · Last updated {new Date(brand.updatedAt).toLocaleDateString()}</p>
              {brand.guidelines?.length > 0 && (
                <div>
                  <h3>Active Guidelines ({brand.guidelines.length})</h3>
                  {brand.guidelines.map((g: any) => (
                    <div key={g.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, background: 'var(--surface)', padding: '2px 6px', borderRadius: 'var(--radius)', marginRight: 8 }}>{g.category}</span>
                      <strong>{g.title}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--text-3)' }}>No brand profile configured. Create one via the API.</p>
          )}
        </div>
      )}

      {activeTab === 'audiences' && (
        <div>
          {personas.length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>No audience personas defined.</p>
          ) : (
            personas.map(p => (
              <div key={p.id} style={{ background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 12 }}>
                <h3 style={{ margin: '0 0 8px' }}>{p.name}</h3>
                {p.segment && <p style={{ margin: '4px 0', color: 'var(--text-2)' }}>Segment: {p.segment}</p>}
                {p.description && <p style={{ margin: '4px 0' }}>{p.description}</p>}
                {p.generatedByAI && <span style={{ fontSize: 11, background: 'var(--success-subtle)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>AI-generated — verify before use</span>}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div>
          {campaigns.length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>No campaigns. Create one via the API.</p>
          ) : (
            campaigns.map(c => (
              <div key={c.id} style={{ background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{c.name}</h3>
                  {c.objective && <p style={{ color: 'var(--text-2)', margin: '4px 0' }}>{c.objective}</p>}
                  {c.budgetRecommendation && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Budget recommendation: {c.budgetRecommendation} (advisory only — NOT spending authority)</p>
                  )}
                </div>
                <span style={{ background: getStatusColor(c.status), color: '#fff', padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600 }}>{c.status}</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'content' && (
        <div>
          <div style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', padding: 10, borderRadius: 'var(--radius)', fontSize: 12, marginBottom: 16 }}>
            Drafts are NOT approved. AI-generated content requires explicit human review and approval before publication.
          </div>
          {content.length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>No content items. Create via the API.</p>
          ) : (
            content.map(c => (
              <div key={c.id} style={{ background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{c.title}</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0' }}>{c.contentType} {c.channel ? `· ${c.channel}` : ''}</p>
                    {c.generatedByAI && <span style={{ fontSize: 11, background: 'var(--info-subtle)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>AI Draft — review required</span>}
                  </div>
                  <span style={{ background: getStatusColor(c.status), color: '#fff', padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600 }}>{c.status}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>v{c.contentVersion} · Created {new Date(c.createdAt).toLocaleDateString()}</p>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div>
          <p style={{ color: 'var(--text-2)' }}>Content calendar — scheduled items require APPROVED content and proper publication governance.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Calendar entries loaded via API. Use /marketing/calendar endpoint.</p>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div>
          {metrics && (
            <div>
              <div style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16 }}>
                ANALYTICS DISCLAIMER: Observed metrics only. Forecasts are projections — NOT realized revenue or outcomes.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {[
                  { label: 'Impressions (Observed)', value: metrics.totalImpressions },
                  { label: 'Clicks (Observed)', value: metrics.totalClicks },
                  { label: 'Conversions (Observed)', value: metrics.totalConversions },
                  { label: 'Total Campaigns', value: metrics.totalCampaigns },
                ].map((m: Metric) => (
                  <div key={m.label} style={{ background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{m.value}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
