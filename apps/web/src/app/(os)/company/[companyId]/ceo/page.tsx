import { CeoWorkspace } from '@/components/ceo-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <CeoWorkspace companyId={(await params).companyId} />;
}
