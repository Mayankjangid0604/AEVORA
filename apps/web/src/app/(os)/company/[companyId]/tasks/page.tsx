import { Suspense } from 'react';
import { TasksView } from '@/components/task-views';
import { SectionSkeleton } from '@/components/query-state';

export default async function TasksPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return (
    <Suspense fallback={<SectionSkeleton rows={4} label="tasks" />}>
      <TasksView companyId={companyId} />
    </Suspense>
  );
}
