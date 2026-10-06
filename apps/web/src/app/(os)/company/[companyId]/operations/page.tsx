import { OperationsWorkspace } from '@/components/operations-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <OperationsWorkspace companyId={(await params).companyId} />;
}
