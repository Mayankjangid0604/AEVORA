import { notFound } from 'next/navigation';
import { ProposalDetail } from '@/components/intelligence-views';
import { isSafeId } from '@/lib/http';

export default async function ProposalPage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  if (!isSafeId(id)) notFound();
  return <ProposalDetail companyId={companyId} proposalId={id} />;
}
