import { MarketingWorkspace } from '@/components/growth-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <MarketingWorkspace companyId={(await params).companyId} />;
}
