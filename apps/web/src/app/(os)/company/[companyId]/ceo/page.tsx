import { ExecutiveConsole } from '@/components/executive/ExecutiveConsole';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <ExecutiveConsole companyId={companyId} />;
}
