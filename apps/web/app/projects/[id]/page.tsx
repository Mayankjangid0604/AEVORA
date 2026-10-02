'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../lib/api';
import { StatusBadge, formatINRWhole, formatAC } from '../../components/ui';

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.project(id).then(res => {
      if (res.error) setError(res.error);
      else setProject(res.data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="state-loading">Loading project…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;
  if (!project) return <div className="state-empty">Project not found</div>;

  return (
    <>
      <div className="page-header">
        <h2>{project.name}</h2>
        <p>{project.client?.name} · <StatusBadge status={project.status} /></p>
      </div>

      <div className="section">
        <h3 className="section-title">Economics</h3>
        <div className="detail-grid">
          <div className="detail-item"><div className="detail-label">Quoted Price</div><div className="detail-value">{formatINRWhole(project.quotedPrice)}</div></div>
          <div className="detail-item"><div className="detail-label">Expected Revenue</div><div className="detail-value">{formatINRWhole(project.expectedRevenue)}</div></div>
          <div className="detail-item"><div className="detail-label">Realized Revenue</div><div className="detail-value" style={{color: 'var(--status-healthy)'}}>{formatINRWhole(project.realizedRevenue)}</div></div>
          <div className="detail-item"><div className="detail-label">Estimated Cost</div><div className="detail-value">{formatINRWhole(project.estimatedCost)}</div></div>
          <div className="detail-item"><div className="detail-label">Actual Cost</div><div className="detail-value">{formatINRWhole(project.actualCost)}</div></div>
          <div className="detail-item"><div className="detail-label">AC Cost</div><div className="detail-value">{formatAC(project.acCost)}</div></div>
          <div className="detail-item"><div className="detail-label">Margin</div><div className="detail-value" style={{color: (project.margin || 0) >= 0 ? 'var(--status-healthy)' : 'var(--severity-critical)'}}>{formatINRWhole(project.margin)}</div></div>
          <div className="detail-item"><div className="detail-label">Financial Status</div><div className="detail-value"><StatusBadge status={project.financialStatus || 'PENDING'} /></div></div>
        </div>
      </div>

      {project.milestones && project.milestones.length > 0 && (
        <div className="section">
          <h3 className="section-title">Milestones</h3>
          <table className="data-table">
            <thead><tr><th>#</th><th>Name</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {project.milestones.map((m: any) => (
                <tr key={m.id}>
                  <td>{m.sequence}</td>
                  <td>{m.name}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td style={{color: 'var(--text-muted)', fontSize: '0.75rem'}}>{m.dueAt ? new Date(m.dueAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {project.risks && project.risks.length > 0 && (
        <div className="section">
          <h3 className="section-title">Risks</h3>
          <table className="data-table">
            <thead><tr><th>Risk</th><th>Probability</th><th>Impact</th><th>Status</th></tr></thead>
            <tbody>
              {project.risks.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{r.probability}%</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{r.impact}%</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {project.assignments && project.assignments.length > 0 && (
        <div className="section">
          <h3 className="section-title">Team</h3>
          <table className="data-table">
            <thead><tr><th>Employee</th><th>Role</th><th>Allocation</th><th>Status</th></tr></thead>
            <tbody>
              {project.assignments.map((a: any) => (
                <tr key={a.id}>
                  <td>{a.employee?.name || '—'}</td>
                  <td>{a.role}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{a.allocation}%</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {project.tasks && project.tasks.length > 0 && (
        <div className="section">
          <h3 className="section-title">Tasks</h3>
          <table className="data-table">
            <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Progress</th></tr></thead>
            <tbody>
              {project.tasks.map((t: any) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><StatusBadge status={t.priority} /></td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{t.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {project.deliveries && project.deliveries.length > 0 && (
        <div className="section">
          <h3 className="section-title">Deliveries</h3>
          <table className="data-table">
            <thead><tr><th>Version</th><th>Summary</th><th>Status</th></tr></thead>
            <tbody>
              {project.deliveries.map((d: any) => (
                <tr key={d.id}>
                  <td>v{d.version}</td>
                  <td>{d.summary}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
