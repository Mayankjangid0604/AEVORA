import { SalesWorkspace } from '@/components/growth-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <SalesWorkspace companyId={(await params).companyId} />;
}
