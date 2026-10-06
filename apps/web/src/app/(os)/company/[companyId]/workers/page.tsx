import { WorkerRoster } from '@/components/slice10-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <WorkerRoster companyId={(await params).companyId} />;
}
