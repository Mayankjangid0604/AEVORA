import { Suspense } from 'react';
import { ProjectsView } from '@/components/project-views';
import { SectionSkeleton } from '@/components/query-state';

export default async function ProjectsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return (
    <Suspense fallback={<SectionSkeleton rows={4} label="projects" />}>
      <ProjectsView companyId={companyId} />
    </Suspense>
  );
}
