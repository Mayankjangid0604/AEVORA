import { WorkerRoster } from '@/components/administration-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <WorkerRoster companyId={(await params).companyId} />;
}
