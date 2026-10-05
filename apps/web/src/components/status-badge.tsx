/** Backend status strings rendered verbatim; colour is a hint only, the text carries the meaning. */
const OK = 'bg-ok-soft text-ok';
const WARN = 'bg-warn-soft text-warn';
const DANGER = 'bg-danger-soft text-danger';
const INFO = 'bg-accent-soft text-accent';

/** Visual treatment per backend enum value. Unknown values fall back to neutral. No health is inferred. */
const TONE: Record<string, string> = {
  // Company / Employee / Department
  ACTIVE: OK, ON_HOLD: WARN, INACTIVE: WARN, PAUSED: WARN, SUSPENDED: DANGER, TERMINATED: DANGER, CLOSED: DANGER,
  // ProjectStatus
  PLANNED: INFO, ONBOARDING: INFO, IN_QA: INFO, IN_REVIEW: INFO, DELIVERED: OK, ACCEPTED: OK, COMPLETED: OK, BLOCKED: DANGER,
  // Milestone / requirement / risk / assignment statuses
  IN_PROGRESS: INFO, SATISFIED: OK, REJECTED: DANGER, CANCELLED: WARN, OPEN: WARN, MITIGATED: OK, PROPOSED: INFO, RELEASED: WARN,
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
