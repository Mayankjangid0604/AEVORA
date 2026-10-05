import { redirect } from 'next/navigation';

/** The department list lives on the Organization page. */
export default async function DepartmentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  redirect(`/company/${encodeURIComponent((await params).companyId)}/organization`);
}
