'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { chairmanFetch } from '../lib/api';

/** Overview preview of /world-map — loads its own pins so the overview page stays untouched. */
export default function ClientMapCard() {
  const [pins, setPins] = useState<any[] | null>(null);

  useEffect(() => {
    chairmanFetch<{ pins: any[] }>('/map/pins').then((r) => setPins(r.data?.pins ?? []));
  }, []);

  return (
    <section className="card" style={{ margin: 'var(--space-6) 0' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-base)' }}>Client Map</h3>
        <Link href="/world-map" style={{ fontSize: 'var(--text-sm)' }}>View full map</Link>
      </div>
      {pins === null ? (
        <div className="state-loading" style={{ height: 280 }}>Loading map…</div>
      ) : pins.length > 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Map visual removed</div>
      ) : (
        <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
          <div className="empty-state-title">No leads yet</div>
          <div className="empty-state-desc">Find leads from the Sales page to see them on the map.</div>
        </div>
      )}
    </section>
  );
}
