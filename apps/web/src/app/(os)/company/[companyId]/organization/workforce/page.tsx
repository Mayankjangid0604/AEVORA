import { Suspense } from 'react';
import { WorkforceView } from '@/components/organization-views';
import { SectionSkeleton } from '@/components/query-state';

export default async function WorkforcePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return (
    <Suspense fallback={<SectionSkeleton rows={5} label="workforce" />}>
      <WorkforceView companyId={companyId} />
    </Suspense>
  );
}
