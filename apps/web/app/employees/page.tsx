'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/ui';
import Link from 'next/link';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.employees().then(res => {
      if (res.error) setError(res.error);
      else setEmployees(res.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading employees…</div>;
  if (error) return <div className="state-error">{error}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Employees</h2>
        <p>{employees.length} employees</p>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Department</th>
            <th>Status</th>
            <th>Activity</th>
            <th>Performance</th>
            <th>Salary (AC)</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp: any) => (
            <tr key={emp.id} className="clickable-row">
              <td><Link href={`/employees/${emp.id}`} style={{color: 'var(--accent-blue)'}}>{emp.name}</Link></td>
              <td>{emp.role?.title || '—'}</td>
              <td>{emp.department?.name || '—'}</td>
              <td><StatusBadge status={emp.status} /></td>
              <td><StatusBadge status={emp.activity} /></td>
              <td style={{fontFamily: 'var(--font-mono)'}}>{emp.performance}/100</td>
              <td style={{fontFamily: 'var(--font-mono)'}}>{emp.salary?.toLocaleString('en-IN') || '0'} AC</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
