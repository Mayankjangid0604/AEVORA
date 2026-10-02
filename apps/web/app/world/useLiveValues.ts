'use client';

import { useCallback, useEffect, useState } from 'react';
import { chairmanFetch, getToken } from '../lib/api';

// Same "open" definitions as the overview page.
const OPEN_LEAD = ['NEW', 'CONTACTED', 'QUALIFIED'];
const OPEN_PROJECT = ['SCOPING', 'BUILDING', 'SAMPLE_SENT', 'REVISION', 'APPROVED', 'INVOICED'];
const REFRESH_MS = 15000;

/** Live figures for the room wall screens, keyed by department id. */
export function useLiveValues(): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!getToken()) return setValues({}); // signed out: the world is scenery only
    const [surv, leads, projects] = await Promise.all([
      chairmanFetch<{ status?: string; currentStatus?: string; balancePaise?: number }>('/survival/status'),
      chairmanFetch<{ status: string }[]>('/lead-gen/leads'),
      chairmanFetch<{ status: string }[]>('/delivery/projects'),
    ]);
    const next: Record<string, string> = {};
    if (surv.data) {
      if (typeof surv.data.balancePaise === 'number') next.finance = `₹${Math.round(surv.data.balancePaise / 100).toLocaleString('en-IN')}`;
      const status = surv.data.status ?? surv.data.currentStatus;
      if (status) next.reception = status;
    }
    if (Array.isArray(leads.data)) next.sales = `${leads.data.filter((l) => OPEN_LEAD.includes(l.status)).length} leads`;
    if (Array.isArray(projects.data)) next.projects = `${projects.data.filter((p) => OPEN_PROJECT.includes(p.status)).length} open`;
    setValues(next);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return values;
}
