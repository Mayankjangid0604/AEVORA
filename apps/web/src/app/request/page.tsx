import type { Metadata } from 'next';
import { RequestForm, RequestStatusLookup } from '@/components/request-form';

export const metadata: Metadata = { title: 'Request a service · AEVORA' };

/** Public page (no sign-in; allowed by proxy.ts). */
export default function RequestPage() {
  return (
    <main className="flex min-h-screen justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8" aria-labelledby="request-title">
          <h1 id="request-title" className="text-lg font-semibold">Request a service</h1>
          <p className="mb-6 text-sm text-muted">Tell us what you need. A person from our team reviews every request and replies by email.</p>
          <RequestForm />
        </section>
        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8" aria-labelledby="status-title">
          <h2 id="status-title" className="mb-4 text-base font-semibold">Check a request</h2>
          <RequestStatusLookup />
        </section>
      </div>
    </main>
  );
}
