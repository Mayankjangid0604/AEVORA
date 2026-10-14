import { JobControlsWorkspace } from '@/components/request-queue-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <JobControlsWorkspace companyId={(await params).companyId} />;
}
