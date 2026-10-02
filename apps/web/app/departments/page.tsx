'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/ui';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.departments().then(res => {
      if (res.error) setError(res.error);
      else setDepartments(res.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading departments…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Departments</h2>
        <p>{departments.length} departments</p>
      </div>

      {departments.map((dept: any) => (
        <div key={dept.id} className="fin-section">
          <h3>{dept.name} <StatusBadge status={dept.status} /></h3>
          <div className="detail-grid" style={{marginTop: 'var(--space-4)'}}>
            <div className="detail-item"><div className="detail-label">Employees</div><div className="detail-value">{dept.employees?.length || 0}</div></div>
            <div className="detail-item"><div className="detail-label">Budgets</div><div className="detail-value">{dept.budgets?.length || 0}</div></div>
          </div>
          {dept.employees && dept.employees.length > 0 && (
            <table className="data-table" style={{marginTop: 'var(--space-3)'}}>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {dept.employees.map((emp: any) => (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{emp.role?.title || '—'}</td>
                    <td><StatusBadge status={emp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
}
