'use client';
import { SystemState } from '@/components/system-state';

export default function OsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3">
      <SystemState kind="error" />
      <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
        Try again
      </button>
    </div>
  );
}
