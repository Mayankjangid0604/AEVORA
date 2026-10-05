import { notFound } from 'next/navigation';
import { ProjectDetailView } from '@/components/project-views';
import { isSafeId } from '@/lib/http';

export default async function ProjectPage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  if (!isSafeId(id)) notFound();
  return <ProjectDetailView companyId={companyId} projectId={id} />;
}
