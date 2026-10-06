import { DecisionsWorkspace } from '@/components/ceo-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <DecisionsWorkspace companyId={(await params).companyId} />;
}
