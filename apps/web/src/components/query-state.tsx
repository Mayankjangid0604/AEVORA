import { ApiError } from '@/lib/http';
import { SystemState } from './system-state';

/**
 * The one way a data section shows non-success states. Messages are fixed copy per status kind:
 * backend error bodies and stack traces are never rendered.
 */
export function QueryError({ error, forbiddenDetail }: { error: unknown; forbiddenDetail?: string }) {
  const kind = error instanceof ApiError ? error.kind : 'error';
  return <SystemState kind={kind} detail={kind === 'forbidden' ? forbiddenDetail : undefined} />;
}

export function SectionSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-9" />)}
      <span className="sr-only">Loading {label}...</span>
    </div>
  );
}
