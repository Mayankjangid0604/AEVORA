import { AssistantWorkspace } from '@/components/slice10-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <AssistantWorkspace companyId={(await params).companyId} />;
}
