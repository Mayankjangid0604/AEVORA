/**
 * Human / AI provenance exactly as the backend records it (WorkerProfile.workerType). Nothing is inferred from
 * names or roles: an employee without a worker profile is shown as "Not recorded".
 */
const LABEL: Record<string, string> = {
  HUMAN: 'Human',
  AI: 'AI',
  AI_AGENT: 'AI agent',
  AI_MANAGER: 'AI manager',
  AI_EXECUTIVE: 'AI executive',
};

export function provenanceLabel(workerType: string | null | undefined): string {
  if (!workerType) return 'Not recorded';
  return LABEL[workerType] ?? workerType;
}

export function ProvenanceBadge({ workerType }: { workerType: string | null | undefined }) {
  const isAi = !!workerType && workerType !== 'HUMAN';
  const tone = !workerType ? 'border-border text-muted' : isAi ? 'border-accent/40 text-accent' : 'border-border text-text';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-control border px-1.5 py-0.5 text-[11px] ${tone}`}>
      <span aria-hidden="true">{!workerType ? '–' : isAi ? '◆' : '●'}</span>
      {provenanceLabel(workerType)}
    </span>
  );
}
