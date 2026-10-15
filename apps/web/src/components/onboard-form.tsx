'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';

export function OnboardForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }

    const payload = {
      adminName: form.get('adminName'),
      adminEmail: form.get('adminEmail'),
      password,
      companyName: form.get('companyName'),
      legalName: form.get('legalName') || undefined,
      description: form.get('description') || undefined,
    };

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (res?.ok) {
      const data = await res.json().catch(() => ({}));
      const companyId = data?.companyId;
      window.location.assign(companyId ? `/company/${encodeURIComponent(companyId)}` : '/');
      return;
    }

    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    setError(res ? body?.message ?? 'Registration failed' : 'AEVORA backend could not be reached');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm" noValidate>
      <div>
        <label htmlFor="companyName" className="block text-xs font-medium text-muted">Company Name *</label>
        <input id="companyName" name="companyName" required maxLength={120} placeholder="e.g. Acme Innovations" className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      <div>
        <label htmlFor="legalName" className="block text-xs font-medium text-muted">Legal Entity Name (optional)</label>
        <input id="legalName" name="legalName" maxLength={150} placeholder="e.g. Acme Innovations Ltd." className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      <div>
        <label htmlFor="adminName" className="block text-xs font-medium text-muted">Administrator Full Name *</label>
        <input id="adminName" name="adminName" required maxLength={80} autoComplete="name" placeholder="e.g. Jane Doe" className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      <div>
        <label htmlFor="adminEmail" className="block text-xs font-medium text-muted">Administrator Email *</label>
        <input id="adminEmail" name="adminEmail" type="email" required maxLength={254} autoComplete="email" placeholder="jane@example.com" className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-muted">Password * (min 8 characters, letter &amp; number)</label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-medium text-muted">Confirm Password *</label>
        <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      <div>
        <label htmlFor="description" className="block text-xs font-medium text-muted">Business Description (optional)</label>
        <textarea id="description" name="description" rows={2} maxLength={500} placeholder="Brief summary of your company's mission and services" className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent" />
      </div>

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      <button type="submit" disabled={busy} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">
        {busy ? 'Provisioning company...' : 'Register Company &amp; Sign in'}
      </button>

      <div className="pt-2 text-center text-xs text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in here
        </Link>
      </div>
    </form>
  );
}
