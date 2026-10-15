import { DeliveryWorkspace } from '@/components/pipeline-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <DeliveryWorkspace companyId={(await params).companyId} />;
}
