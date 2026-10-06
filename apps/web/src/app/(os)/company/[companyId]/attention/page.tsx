import { AttentionWorkspace } from '@/components/ceo-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <AttentionWorkspace companyId={(await params).companyId} />;
}
