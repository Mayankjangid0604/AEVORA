'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  House, Buildings, Robot, Lightbulb, CheckSquare, Bell,
  Play, TrendUp, Funnel, Package, Headset, MegaphoneSimple,
  EnvelopeSimple, CurrencyDollar, Heartbeat, Users,
  Rows, FolderOpen, Rocket, MapPin, ChatCircle, BookOpen,
  Flask, Sun, Moon, SignOut, type Icon,
} from '@phosphor-icons/react';
import { chairmanFetch, clearToken } from '../lib/api';

type Theme = 'light' | 'dark';

const NAV: { section: string; items: { href: string; label: string; icon: Icon; badge?: boolean }[] }[] = [
  {
    section: 'Command',
    items: [
      { href: '/', label: 'Overview', icon: House },
      { href: '/world', label: 'Company World', icon: Buildings },
      { href: '/assistant', label: 'Assistant', icon: Robot },
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/decisions', label: 'Decisions', icon: CheckSquare },
      { href: '/alerts', label: 'Alerts', icon: Bell },
      { href: '/simulation', label: 'Simulation', icon: Play },
    ],
  },
  {
    section: 'Revenue',
    items: [
      { href: '/sales', label: 'Sales & BD', icon: TrendUp },
      { href: '/acquisition', label: 'Acquisition', icon: Funnel },
      { href: '/delivery', label: 'Delivery', icon: Package },
      { href: '/customer-operations', label: 'Customer Ops', icon: Headset },
      { href: '/marketing', label: 'Marketing', icon: MegaphoneSimple },
      { href: '/inbox', label: 'Inbox', icon: EnvelopeSimple, badge: true },
    ],
  },
  {
    section: 'Money',
    items: [
      { href: '/financials', label: 'Financials', icon: CurrencyDollar },
      { href: '/survival', label: 'Survival', icon: Heartbeat },
    ],
  },
  {
    section: 'Company',
    items: [
      { href: '/employees', label: 'Employees', icon: Users },
      { href: '/departments', label: 'Departments', icon: Rows },
      { href: '/projects', label: 'Projects', icon: FolderOpen },
      { href: '/ventures', label: 'Ventures', icon: Rocket },
      { href: '/world-map', label: 'World Map', icon: MapPin },
      { href: '/communication', label: 'Communication', icon: ChatCircle },
      { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
      { href: '/research', label: 'AI Lab', icon: Flask },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [inboxCount, setInboxCount] = useState(0);
  const [theme, setTheme] = useState<Theme>('dark');

  // The saved theme is applied before paint by the script in layout.tsx; this syncs the toggle label.
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }, []);

  // Inbox badge: replies needing attention, every 30 s and right after inbox actions.
  useEffect(() => {
    const load = () => chairmanFetch<{ count: number }>('/inbox/unread-count').then((r) => r.data && setInboxCount(r.data.count));
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener('aevora:inbox-changed', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('aevora:inbox-changed', load);
    };
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('aevora_theme', next);
    } catch {
      /* storage unavailable — theme still applies for this visit */
    }
  }

  // Exact match or a sub-path — '/world' must not light up on '/world-map'.
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-name">AEVORA</div>
        <div className="sidebar-logo-sub">SAAHVIK Tech</div>
      </div>

      <nav aria-label="Main">
        {NAV.map((group) => (
          <div key={group.section} className="sidebar-section">
            <div className="sidebar-section-label">{group.section}</div>
            {group.items.map(({ href, label, icon: ItemIcon, badge }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} className={`sidebar-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <ItemIcon size={16} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  {label}
                  {badge && inboxCount > 0 && (
                    <span className="sidebar-item-badge" aria-label={`${inboxCount} replies need attention`}>{inboxCount}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="theme-toggle">
        <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <><Sun size={12} aria-hidden="true" /> Light</> : <><Moon size={12} aria-hidden="true" /> Dark</>}
        </button>
        <button type="button" onClick={() => { clearToken(); window.dispatchEvent(new Event('aevora:unauthorized')); }}>
          <SignOut size={12} aria-hidden="true" /> Sign out
        </button>
      </div>
    </aside>
  );
}
