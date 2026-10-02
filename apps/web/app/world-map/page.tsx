'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import WorldMap, { PIN_COLORS, type MapPin } from '../components/WorldMap';

interface MapSummary {
  totalPins: number;
  leads: number;
  activeProjects: number;
  paidClients: number;
  totalPipelineRs: number;
  paidRs: number;
  approximatePins: number;
}

const rs = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function WorldMapPage() {
  const [pins, setPins] = useState<MapPin[] | null>(null);
  const [summary, setSummary] = useState<MapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    const r = await chairmanFetch<{ pins: MapPin[]; summary: MapSummary }>('/map/pins');
    if (r.data) {
      setPins(r.data.pins);
      setSummary(r.data.summary);
      setLastUpdated(new Date());
    } else setPins((p) => p ?? []);
    setError(r.error);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!pins) return <div className="state-loading">Loading map data…</div>;

  return (
    <>
      <div className="page-header flex-between" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Client World Map</h2>
          <p>All leads and clients in Sikar and Rajasthan</p>
        </div>
        {lastUpdated && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</p>}
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      {summary && (
        <div className="metrics-grid" style={{ marginBottom: 16 }}>
          <div className="card"><div className="card-label">Total</div><div className="card-value">{summary.totalPins}</div></div>
          <div className="card"><div className="card-label">Leads</div><div className="card-value" style={{ color: PIN_COLORS.LEAD }}>{summary.leads}</div></div>
          <div className="card"><div className="card-label">Active projects</div><div className="card-value" style={{ color: PIN_COLORS.PROJECT }}>{summary.activeProjects}</div></div>
          <div className="card"><div className="card-label">Paid clients</div><div className="card-value" style={{ color: PIN_COLORS.PAID_CLIENT }}>{summary.paidClients}</div></div>
          <div className="card"><div className="card-label">Open pipeline</div><div className="card-value">{rs(summary.totalPipelineRs)}</div><div className="card-sub">Paid: {rs(summary.paidRs)}</div></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
        {([['LEAD', 'Lead (potential client)'], ['PROJECT', 'Active project'], ['PAID_CLIENT', 'Paid client']] as const).map(([type, text]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="legend-dot" style={{ width: 12, height: 12, borderRadius: '50%', background: PIN_COLORS[type], border: '2px solid #fff', display: 'inline-block' }} />
            {text}
          </span>
        ))}
        {summary && summary.approximatePins > 0 && (
          <span style={{ color: 'var(--text-muted)' }}>{summary.approximatePins} pin{summary.approximatePins === 1 ? '' : 's'} placed approximately (no GPS stored)</span>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {pins.length === 0 ? (
          <div className="empty-state" style={{ border: 'none' }}>
            <div className="empty-state-title">No leads or clients yet</div>
            <div className="empty-state-desc">Find leads from the Sales page to see them appear here.</div>
          </div>
        ) : (
          <WorldMap pins={pins} height="520px" />
        )}
      </div>

      {pins.length > 0 && (
        <section className="section" style={{ marginTop: 24 }}>
          <div className="section-title">All locations ({pins.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {pins.map((pin) => (
              <div key={pin.id} className="card" style={{ borderLeft: `3px solid ${PIN_COLORS[pin.type]}` }}>
                <div className="flex-between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 600, fontSize: 14 }}>{pin.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{pin.industry || 'Business'} • {pin.status}</div>
                  </div>
                  {pin.valuePaise > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: PIN_COLORS.PAID_CLIENT }}>{rs(Math.round(pin.valuePaise / 100))}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{pin.address}{pin.approximate ? ' (approx.)' : ''}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
