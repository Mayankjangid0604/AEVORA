import { OrganizationOverview } from '@/components/organization-views';

export default async function OrganizationPage({ params }: { params: Promise<{ companyId: string }> }) {
  return <OrganizationOverview companyId={(await params).companyId} />;
}
