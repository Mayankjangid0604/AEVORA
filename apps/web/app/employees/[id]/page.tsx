'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../lib/api';
import { StatusBadge, formatAC } from '../../components/ui';
import { VoiceProfileSection } from '../../components/VoiceProfileSection';

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [emp, setEmp] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.employee(id).then(res => {
      if (res.error) setError(res.error);
      else setEmp(res.data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="state-loading">Loading employee…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;
  if (!emp) return <div className="state-empty">Employee not found</div>;

  return (
    <>
      <div className="page-header">
        <h2>{emp.name}</h2>
        <p>{emp.role?.title} · {emp.department?.name} · <StatusBadge status={emp.status} /></p>
      </div>

      <div className="section">
        <h3 className="section-title">Identity</h3>
        <div className="detail-grid">
          <div className="detail-item"><div className="detail-label">Role</div><div className="detail-value">{emp.role?.title}</div></div>
          <div className="detail-item"><div className="detail-label">Department</div><div className="detail-value">{emp.department?.name}</div></div>
          <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={emp.status} /></div></div>
          <div className="detail-item"><div className="detail-label">Activity</div><div className="detail-value"><StatusBadge status={emp.activity} /></div></div>
          <div className="detail-item"><div className="detail-label">Availability</div><div className="detail-value"><StatusBadge status={emp.availability} /></div></div>
          <div className="detail-item"><div className="detail-label">Salary</div><div className="detail-value">{formatAC(emp.salary)}/period</div></div>
          <div className="detail-item"><div className="detail-label">Hire Date</div><div className="detail-value">{new Date(emp.hireDate).toLocaleDateString()}</div></div>
        </div>
      </div>

      <VoiceProfileSection employeeId={id} />

      {emp.performanceRecord && (
        <div className="section">
          <h3 className="section-title">Performance</h3>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Tasks Completed</div><div className="detail-value">{emp.performanceRecord.tasksCompleted}</div></div>
            <div className="detail-item"><div className="detail-label">Tasks Late</div><div className="detail-value">{emp.performanceRecord.tasksLate}</div></div>
            <div className="detail-item"><div className="detail-label">Quality Score</div><div className="detail-value">{emp.performanceRecord.qualityScore}/100</div></div>
            <div className="detail-item"><div className="detail-label">Productivity</div><div className="detail-value">{emp.performanceRecord.productivityScore}/100</div></div>
          </div>
        </div>
      )}

      {emp.skills && emp.skills.length > 0 && (
        <div className="section">
          <h3 className="section-title">Skills</h3>
          <table className="data-table">
            <thead><tr><th>Skill</th><th>Category</th><th>Proficiency</th><th>Experience</th></tr></thead>
            <tbody>
              {emp.skills.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.category}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{s.proficiency}/100</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{s.experience}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {emp.assignedTasks && emp.assignedTasks.length > 0 && (
        <div className="section">
          <h3 className="section-title">Assigned Tasks</h3>
          <table className="data-table">
            <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Progress</th></tr></thead>
            <tbody>
              {emp.assignedTasks.map((t: any) => (
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

      {emp.projectAssignments && emp.projectAssignments.length > 0 && (
        <div className="section">
          <h3 className="section-title">Project Assignments</h3>
          <table className="data-table">
            <thead><tr><th>Project</th><th>Role</th><th>Allocation</th><th>Status</th></tr></thead>
            <tbody>
              {emp.projectAssignments.map((a: any) => (
                <tr key={a.id}>
                  <td>{a.project?.name || '—'}</td>
                  <td>{a.role}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{a.allocation}%</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {emp.history && emp.history.length > 0 && (
        <div className="section">
          <h3 className="section-title">Employment History</h3>
          <table className="data-table">
            <thead><tr><th>Event</th><th>Previous</th><th>New</th><th>Date</th></tr></thead>
            <tbody>
              {emp.history.map((h: any) => (
                <tr key={h.id}>
                  <td>{h.eventType}</td>
                  <td style={{color: 'var(--text-muted)'}}>{h.previousValue || '—'}</td>
                  <td>{h.newValue || '—'}</td>
                  <td style={{color: 'var(--text-muted)', fontSize: '0.75rem'}}>{new Date(h.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
