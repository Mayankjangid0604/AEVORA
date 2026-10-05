import { IntelligenceOverview } from '@/components/intelligence-views';

export default async function IntelligencePage({ params }: { params: Promise<{ companyId: string }> }) {
  return <IntelligenceOverview companyId={(await params).companyId} />;
}
