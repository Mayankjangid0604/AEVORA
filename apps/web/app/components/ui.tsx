export function StatusBadge({ status }: { status: string }) {
  const cls = `badge badge-${status.toLowerCase().replace(/ /g, '_')}`;
  return <span className={cls}>{status}</span>;
}

export function formatINR(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatINRWhole(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export function formatAC(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${amount.toLocaleString('en-IN')} AC`;
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
