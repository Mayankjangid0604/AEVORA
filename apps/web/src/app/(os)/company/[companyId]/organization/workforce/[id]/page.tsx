import { notFound } from 'next/navigation';
import { EmployeeDetail } from '@/components/organization-views';
import { isSafeId } from '@/lib/http';

export default async function EmployeePage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  if (!isSafeId(id)) notFound();
  return <EmployeeDetail companyId={companyId} employeeId={id} />;
}
