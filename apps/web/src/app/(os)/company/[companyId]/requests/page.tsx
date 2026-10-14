import { RequestQueueWorkspace } from '@/components/request-queue-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <RequestQueueWorkspace companyId={(await params).companyId} />;
}
