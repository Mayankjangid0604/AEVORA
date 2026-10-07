import { notFound } from 'next/navigation';
import { backendFetch, readSessionToken } from '@/server/api';
import { redirectIfUnauthenticated } from '@/server/guard';
import { isSafeId } from '@/lib/http';
import type { Company } from '@/lib/types';
import type { WorldSnapshot } from '@aevora/shared';

import { SpatialViewport } from '@/components/spatial/SpatialViewport';

export default async function CompanyWorldPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  if (!isSafeId(companyId)) notFound();

  const token = await readSessionToken();

  // Authoritative company lookup
  const companyRes = await backendFetch<Company>(`companies/${companyId}`, {
    companyId,
    token,
  });
  await redirectIfUnauthenticated(companyRes);

  if (!companyRes.ok) {
    notFound();
  }

  // Authoritative initial spatial snapshot lookup
  const snapshotRes = await backendFetch<WorldSnapshot>(`world-state/snapshot/${companyId}`, {
    companyId,
    token,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">3D Spatial HQ</h2>
          <p className="text-xs text-muted">
            Authoritative spatial projection of {companyRes.data.name} campus, departments, and personnel.
          </p>
        </div>
      </div>

      <SpatialViewport
        companyId={companyId}
        companyName={companyRes.data.name}
        initialSnapshot={snapshotRes.ok ? snapshotRes.data : null}
      />
    </div>
  );
}
