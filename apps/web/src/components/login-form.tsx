'use client';
import { useState, type FormEvent } from 'react';

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ identifier: form.get('identifier'), password: form.get('password') }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.assign(next); // `next` was sanitised server-side by safeNextPath
      return;
    }
    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    setError(res ? body?.message ?? 'Sign-in failed' : 'AEVORA backend could not be reached');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="identifier" className="block text-sm text-muted">Email or actor ID</label>
        <input id="identifier" name="identifier" autoComplete="username" required className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-muted">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:opacity-60">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
