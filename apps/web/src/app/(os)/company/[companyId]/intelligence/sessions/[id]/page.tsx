import { notFound } from 'next/navigation';
import { SessionDetail } from '@/components/intelligence-views';
import { isSafeId } from '@/lib/http';

export default async function SessionPage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  if (!isSafeId(id)) notFound();
  return <SessionDetail companyId={companyId} sessionId={id} />;
}
