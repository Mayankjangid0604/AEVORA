import { NotificationsWorkspace } from '@/components/administration-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <NotificationsWorkspace companyId={(await params).companyId} />;
}
