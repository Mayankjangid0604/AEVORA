import { notFound } from 'next/navigation';
import { TaskDetailView } from '@/components/task-views';
import { isSafeId } from '@/lib/http';

export default async function TaskPage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  if (!isSafeId(id)) notFound();
  return <TaskDetailView companyId={companyId} taskId={id} />;
}
