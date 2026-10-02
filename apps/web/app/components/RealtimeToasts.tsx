'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { API_BASE, getToken } from '../lib/api';

type Toast = { id: number; title: string; body: string; href?: string };

// Server event → toast. Each event is also re-dispatched as `aevora:<event>` so pages can refresh.
const EVENTS: Record<string, (d: any) => Omit<Toast, 'id'>> = {
  'ceo.weekly_report': (d) => ({ title: 'CEO weekly report', body: d.biggestChallenge ?? 'A new weekly report is ready.', href: '/management?tab=reports' }),
  'ceo.report': (d) => ({ title: 'CEO morning report', body: d.topRisk ?? 'The CEO sent a report.' }),
  'payment.received': (d) => ({ title: 'Payment received', body: `₹${Math.round((d.amountPaise ?? 0) / 100).toLocaleString('en-IN')}`, href: '/delivery' }),
  'lead.interested': (d) => ({ title: 'Lead interested', body: `${d.businessName} wants to talk`, href: '/inbox' }),
  'inbound.question': (d) => ({ title: d.intent === 'ASKING_PRICE' ? 'Client asking price' : 'Client has a question', body: d.feedback ?? 'A reply needs your answer', href: '/inbox' }),
  'company.shutdown': () => ({ title: 'Company shut down', body: 'Balance below minimum — agents stopped.', href: '/survival' }),
  'employee.hired': (d) => ({ title: 'CEO hired someone', body: `${d.name ?? 'A new employee'} joined as ${d.role ?? 'staff'}${d.department ? ` (${d.department})` : ''}`, href: d.employeeId ? `/employees/${d.employeeId}` : '/employees' }),
  'staffing.room_full': (d) => ({ title: `${d.room ?? 'A'} room is full`, body: `${d.used}/${d.chairs} chairs taken — projects need more people. Add desks or a floor.`, href: '/assistant' }),
  'company.recovered': () => ({ title: 'Company recovered', body: 'Agents resumed.', href: '/survival' }),
};

// Low-priority events: no toast, pages just refresh.
const SILENT = ['ceo.activity', 'ceo.question']; // ceo.question opens CeoQuestionDialog instead of a toast

/** Live connection to the API (JWT-authenticated) that shows toasts for Chairman-facing events. */
export default function RealtimeToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(API_BASE, { transports: ['websocket'], auth: { token } });
    let n = 0;
    for (const ev of SILENT) socket.on(ev, (data: any) => window.dispatchEvent(new CustomEvent(`aevora:${ev}`, { detail: data })));
    for (const [ev, make] of Object.entries(EVENTS)) {
      socket.on(ev, (data: any) => {
        window.dispatchEvent(new CustomEvent(`aevora:${ev}`, { detail: data }));
        const t = { id: ++n, ...make(data ?? {}) };
        setToasts((all) => [...all.slice(-3), t]);
        window.setTimeout(() => setToasts((all) => all.filter((x) => x.id !== t.id)), 9000);
      });
    }
    return () => { socket.disconnect(); };
  }, []);

  if (!toasts.length) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', top: 16, right: 16, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8, width: 320 }}>
      {toasts.map((t) => {
        const body = (
          <>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{t.title}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t.body}</div>
          </>
        );
        return (
          <div key={t.id} className="card" style={{ padding: '12px 14px', boxShadow: 'var(--shadow-elevated)', borderColor: 'var(--border-default)' }}>
            {t.href ? <Link href={t.href} style={{ color: 'inherit', textDecoration: 'none' }}>{body}</Link> : body}
          </div>
        );
      })}
    </div>
  );
}
