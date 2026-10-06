import { CycleDetail } from '@/components/operations-views';

export default async function Page({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  return <CycleDetail companyId={companyId} cycleId={id} />;
}
