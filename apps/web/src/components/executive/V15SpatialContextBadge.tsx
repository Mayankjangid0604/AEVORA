'use client';

import React from 'react';
import Link from 'next/link';
import type { V15SpatialContext } from '@/lib/executive-types';

interface Props {
  companyId: string;
  spatial: V15SpatialContext | undefined;
}

export function V15SpatialContextBadge({ companyId, spatial }: Props) {
  if (!spatial) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface-2/30 px-4 py-2.5 text-xs">
      <div className="flex items-center gap-3">
        <span className="rounded-control border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
          V15 3D DIGITAL-TWIN
        </span>
        <span className="font-medium text-text">{spatial.activeCampus}</span>
        <span className="text-muted">
          Occupancy: <strong className="text-text">{spatial.currentOccupancy}</strong> / {spatial.deskCapacity} desks
        </span>
        <span className="text-muted">
          Active Avatars: <strong className="text-text">{spatial.activeAvatars}</strong>
        </span>
      </div>

      <Link
        href={`/company/${companyId}/world`}
        className="rounded-control border border-border px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-text transition-colors"
      >
        Open 3D Spatial HQ →
      </Link>
    </div>
  );
}
