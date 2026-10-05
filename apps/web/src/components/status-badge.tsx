/** Backend status strings rendered verbatim; colour is a hint only, the text carries the meaning. */
const TONE: Record<string, string> = {
  ACTIVE: 'bg-ok-soft text-ok',
  ON_HOLD: 'bg-warn-soft text-warn',
  INACTIVE: 'bg-warn-soft text-warn',
  PAUSED: 'bg-warn-soft text-warn',
  SUSPENDED: 'bg-danger-soft text-danger',
  TERMINATED: 'bg-danger-soft text-danger',
  CLOSED: 'bg-danger-soft text-danger',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      aria-label={label ? `${label}: ${status}` : undefined}
      className={`inline-block whitespace-nowrap rounded-control px-1.5 py-0.5 text-[11px] font-medium tracking-wide ${TONE[status] ?? 'bg-surface-2 text-muted'}`}
    >
      {status}
    </span>
  );
}
