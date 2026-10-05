import { ChairmanHome } from '@/components/chairman-home';

/** Company OS home (Chairman Home). Access to the company was already decided by the backend in the layout. */
export default async function CompanyHomePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <ChairmanHome companyId={companyId} />;
}
