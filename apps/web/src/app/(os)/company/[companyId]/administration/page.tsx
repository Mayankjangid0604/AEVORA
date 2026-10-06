import { AdministrationOverview } from '@/components/slice10-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <AdministrationOverview companyId={(await params).companyId} />;
}
