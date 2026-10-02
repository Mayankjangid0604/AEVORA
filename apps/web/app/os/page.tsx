'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { OS_APPS } from '../components/os-apps';

export default function OsDesktop() {
  const [inboxCount, setInboxCount] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Per-app badges (e.g. Chairman Mail unread), every 30 s and when a page says it changed.
  useEffect(() => {
    const paths = OS_APPS.flatMap((g) => g.items).map((i) => i.badge).filter((b): b is string => typeof b === 'string');
    const load = () => Promise.all(paths.map((p) => chairmanFetch<{ count: number }>(p).then((r) => [p, r.data?.count ?? 0] as const))).then((e) => setCounts(Object.fromEntries(e)));
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener('aevora:chairman-mail-changed', load);
    return () => { clearInterval(t); window.removeEventListener('aevora:chairman-mail-changed', load); };
  }, []);

  // Inbox badge (same source as the old Sidebar): replies needing attention, every 30 s and right after inbox actions.
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

  return (
    <div className="os-desktop">
      {OS_APPS.map((group) => (
        <section key={group.section}>
          <h2 className="os-section">{group.section}</h2>
          <div className="os-icons">
            {group.items.map(({ href, label, icon: AppIcon, badge }) => (
              <Link key={href} href={href} className="os-icon">
                <span className="os-icon-tile">
                  <AppIcon size={26} aria-hidden="true" />
                  {badge === true && inboxCount > 0 && (
                    <span className="os-icon-badge" aria-label={`${inboxCount} replies need attention`}>{inboxCount}</span>
                  )}
                  {typeof badge === 'string' && (counts[badge] ?? 0) > 0 && (
                    <span className="os-icon-badge" aria-label={`${counts[badge]} unread`}>{counts[badge]}</span>
                  )}
                </span>
                <span className="os-icon-label">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
