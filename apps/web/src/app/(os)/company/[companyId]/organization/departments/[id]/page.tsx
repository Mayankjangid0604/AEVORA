import { notFound } from 'next/navigation';
import { DepartmentDetail } from '@/components/organization-views';
import { isSafeId } from '@/lib/http';

export default async function DepartmentPage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  if (!isSafeId(id)) notFound();
  return <DepartmentDetail companyId={companyId} departmentId={id} />;
}
