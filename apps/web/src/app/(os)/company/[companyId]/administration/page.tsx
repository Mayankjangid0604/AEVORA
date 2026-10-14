import { AdministrationOverview } from '@/components/administration-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <AdministrationOverview companyId={(await params).companyId} />;
}
