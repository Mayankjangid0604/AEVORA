/** Company overview (structural). No metrics are shown until an overview endpoint is verified for this slice. */
export default function CompanyOverviewPage() {
  return (
    <section aria-labelledby="overview-title" className="rounded-lg border border-border bg-surface p-6">
      <h2 id="overview-title" className="text-base font-semibold">Overview</h2>
      <p className="mt-1 text-sm text-muted">Company workspaces are listed above. Overview data is not connected in this slice.</p>
    </section>
  );
}
