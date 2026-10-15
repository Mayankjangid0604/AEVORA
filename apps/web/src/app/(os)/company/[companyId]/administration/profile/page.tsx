import { CompanyProfileView } from '@/components/company-profile-view';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <CompanyProfileView companyId={(await params).companyId} />;
}
