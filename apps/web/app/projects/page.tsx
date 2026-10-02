'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusBadge, formatINRWhole } from '../components/ui';
import Link from 'next/link';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects().then(res => {
      if (res.error) setError(res.error);
      else setProjects(res.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading projects…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Projects</h2>
        <p>{projects.length} projects</p>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Client</th>
            <th>Status</th>
            <th>Quoted</th>
            <th>Revenue</th>
            <th>Margin</th>
            <th>Team</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p: any) => (
            <tr key={p.id} className="clickable-row">
              <td><Link href={`/projects/${p.id}`} style={{color: 'var(--accent-blue)'}}>{p.name}</Link></td>
              <td>{p.client?.name || '—'}</td>
              <td><StatusBadge status={p.status} /></td>
              <td style={{fontFamily: 'var(--font-mono)'}}>{p.quotedPrice ? formatINRWhole(p.quotedPrice) : '—'}</td>
              <td style={{fontFamily: 'var(--font-mono)'}}>{p.realizedRevenue ? formatINRWhole(p.realizedRevenue) : '—'}</td>
              <td style={{fontFamily: 'var(--font-mono)'}}>{p.margin !== null && p.margin !== undefined ? formatINRWhole(p.margin) : '—'}</td>
              <td>{p.assignments?.length || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
