import { CompanyList } from '@/components/company-list';

/** Chairman Home (structural). Only backend-derived data is shown: the companies this session can access. */
export default function HomePage() {
  return (
    <section aria-labelledby="home-title" className="space-y-6">
      <h1 id="home-title" className="text-xl font-semibold">Home</h1>
      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted">Companies</h2>
        <CompanyList />
      </div>
    </section>
  );
}
