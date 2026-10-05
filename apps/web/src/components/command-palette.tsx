'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { commandEntries } from '@/lib/navigation';

/**
 * Command / navigation entry point (Ctrl/Cmd+K). Native <dialog>: focus trap, Escape and the inert
 * background come from the platform. Doubles as the navigation menu below the md breakpoint.
 */
export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const entries = useMemo(() => commandEntries(pathname), [pathname]);
  const q = query.trim().toLowerCase();
  const matches = q ? entries.filter((e) => `${e.label} ${e.group}`.toLowerCase().includes(q)) : entries;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!dialog.current?.open) dialog.current?.showModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => { dialog.current?.close(); setQuery(''); };

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-control border border-border bg-bg px-3 py-1.5 text-sm text-muted hover:text-text"
      >
        <span>Go to…</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="Go to"
        onClose={() => setQuery('')}
        className="m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-0 text-text shadow-2xl"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); const first = matches[0]; if (first) { close(); router.push(first.href); } }}
          className="border-b border-border p-3"
        >
          <label htmlFor="command-input" className="sr-only">Search destinations</label>
          <input
            id="command-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search destinations"
            autoComplete="off"
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
        </form>
        <ul className="max-h-[50vh] overflow-y-auto p-2" aria-label="Destinations">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">No destination matches.</li>}
          {matches.map((e) => (
            <li key={e.href}>
              <Link href={e.href} onClick={close} className="flex items-center justify-between rounded-control px-3 py-2 text-sm hover:bg-surface-2">
                <span>{e.label}</span>
                <span className="text-xs text-muted">{e.group}</span>
              </Link>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
