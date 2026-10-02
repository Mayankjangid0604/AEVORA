'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { timeAgo } from '../components/ui';

const EVENT_COLORS: Record<string, string> = {
  COMPANY: 'var(--accent-blue)',
  MANAGEMENT: 'var(--accent-purple)',
  FINANCIAL: 'var(--accent-emerald)',
  PROJECT: 'var(--accent-cyan)',
  EMPLOYEE: 'var(--status-caution)',
};

function getEventColor(type: string): string {
  if (type.includes('COMPANY')) return EVENT_COLORS.COMPANY;
  if (type.includes('DECISION') || type.includes('MANAGEMENT')) return EVENT_COLORS.MANAGEMENT;
  if (type.includes('CAPITAL') || type.includes('REVENUE') || type.includes('PAYROLL') || type.includes('EXPENSE') || type.includes('FINANCIAL') || type.includes('BUDGET')) return EVENT_COLORS.FINANCIAL;
  if (type.includes('PROJECT') || type.includes('DELIVERY')) return EVENT_COLORS.PROJECT;
  if (type.includes('EMPLOYEE') || type.includes('HIRE') || type.includes('TRAINING')) return EVENT_COLORS.EMPLOYEE;
  return 'var(--text-muted)';
}

export default function ActivityPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activity().then(res => {
      if (res.error) setError(res.error);
      else setEvents(res.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading activity…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;

  return (
    <>
      <div className="page-header">
        <h2>📋 Activity Feed</h2>
        <p>{events.length} recent events</p>
      </div>

      {events.length === 0 ? (
        <div className="state-empty">No activity recorded yet</div>
      ) : (
        <div className="activity-feed">
          {events.map((evt: any) => (
            <div key={evt.id} className="activity-item">
              <div className="activity-dot" style={{ backgroundColor: getEventColor(evt.type) }} />
              <div className="activity-content">
                <div className="activity-type">{evt.type.replace(/_/g, ' ')}</div>
                <div className="activity-time">{timeAgo(evt.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
