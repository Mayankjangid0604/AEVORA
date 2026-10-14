import { OfferWorkspace } from '@/components/offer-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <OfferWorkspace companyId={(await params).companyId} />;
}
