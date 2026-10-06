import { NotificationsWorkspace } from '@/components/slice10-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <NotificationsWorkspace companyId={(await params).companyId} />;
}
