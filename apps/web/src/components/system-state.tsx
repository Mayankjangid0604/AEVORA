import type { ErrorKind } from '@/lib/http';

const COPY: Record<ErrorKind | 'empty', { title: string; body: string }> = {
  unauthenticated: { title: 'Session ended', body: 'Sign in again to continue.' },
  forbidden: { title: 'Access denied', body: 'The AEVORA backend refused this request for your account.' },
  not_found: { title: 'Not found', body: 'This resource does not exist or is not visible to you.' },
  conflict: { title: 'State changed', body: 'This record changed since it was loaded. Reload and try again.' },
  validation: { title: 'Request rejected', body: 'The backend rejected the request as invalid.' },
  unavailable: { title: 'Backend unavailable', body: 'The AEVORA backend could not be reached.' },
  error: { title: 'Something went wrong', body: 'The request failed.' },
  empty: { title: 'Nothing here yet', body: 'The backend returned no records.' },
};

/** The one loading/empty/error/forbidden surface. Messages are truthful; nothing is invented. */
export function SystemState({ kind, title, detail }: { kind: ErrorKind | 'empty'; title?: string; detail?: string }) {
  const c = COPY[kind] ?? COPY.error;
  return (
    <div role={kind === 'empty' ? 'status' : 'alert'} data-state={kind} className="rounded-lg border border-border bg-surface p-6">
      <p className="text-base font-semibold text-text">{title ?? c.title}</p>
      <p className="mt-1 text-sm text-muted">{detail ?? c.body}</p>
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p role="status" aria-live="polite" className="text-sm text-muted">{label}...</p>;
}
