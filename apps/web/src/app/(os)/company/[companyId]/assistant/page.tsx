import { AssistantWorkspace } from '@/components/administration-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <AssistantWorkspace companyId={(await params).companyId} />;
}
