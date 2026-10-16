import { PipelineWorkspace } from '@/components/pipeline-views';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  return <PipelineWorkspace companyId={(await params).companyId} />;
}
