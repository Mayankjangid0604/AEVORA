'use client';
import { useState, type FormEvent } from 'react';
import { intakeErrors, LIMITS, SERVICES, type IntakeForm } from '@/lib/intake';

const input = 'mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-danger';
const EMPTY: IntakeForm = { businessName: '', contactName: '', email: '', phone: '', service: '', description: '', website: '' };
const STATUS_TEXT: Record<string, string> = { RECEIVED: 'Received — waiting for review', IN_REVIEW: 'Being reviewed by our team', ACCEPTED: 'Accepted', CLOSED: 'Closed' };

function Field({ id, label, error, hint, children }: { id: keyof IntakeForm; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Public request form. Sends nothing to the customer and publishes nothing; it only records the request. */
export function RequestForm() {
  const [f, setF] = useState<IntakeForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof IntakeForm, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; message: string } | null>(null);

  const set = (k: keyof IntakeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const aria = (k: keyof IntakeForm) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${k}-error` : undefined });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = intakeErrors(f);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0] ?? '')?.focus();
      return;
    }
    setBusy(true);
    const res = await fetch('/api/public/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(f) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { reference?: string; message?: string } | null;
    setBusy(false);
    if (res?.ok && body?.reference) setDone({ reference: body.reference, message: body.message ?? 'We have received your request.' });
    else setFailure(res ? body?.message ?? 'Your request could not be sent. Please try again.' : 'We could not be reached. Please try again later.');
  }

  if (done) {
    return (
      <div role="status" className="space-y-3">
        <h2 className="text-base font-semibold">Request received</h2>
        <p className="text-sm">{done.message}</p>
        <p className="text-sm">Your reference: <strong className="font-mono">{done.reference}</strong></p>
        <p className="text-xs text-muted">Keep this reference. With it and your email you can check the status below.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-describedby="form-note">
      <Field id="businessName" label="Business name" error={errors.businessName}>
        <input id="businessName" autoComplete="organization" maxLength={LIMITS.businessName} value={f.businessName} onChange={set('businessName')} className={input} {...aria('businessName')} />
      </Field>
      <Field id="contactName" label="Your name" error={errors.contactName}>
        <input id="contactName" autoComplete="name" maxLength={LIMITS.contactName} value={f.contactName} onChange={set('contactName')} className={input} {...aria('contactName')} />
      </Field>
      <Field id="email" label="Email" error={errors.email}>
        <input id="email" type="email" autoComplete="email" maxLength={LIMITS.email} value={f.email} onChange={set('email')} className={input} {...aria('email')} />
      </Field>
      <Field id="phone" label="Phone (optional)" error={errors.phone}>
        <input id="phone" type="tel" autoComplete="tel" maxLength={LIMITS.phone} value={f.phone} onChange={set('phone')} className={input} {...aria('phone')} />
      </Field>
      <Field id="service" label="What do you need?" error={errors.service}>
        <select id="service" value={f.service} onChange={set('service')} className={input} {...aria('service')}>
          <option value="">Choose a service</option>
          {SERVICES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <Field id="description" label="Describe your need" error={errors.description} hint={`${f.description.trim().length}/${LIMITS.description} characters, at least 20.`}>
        <textarea id="description" rows={6} maxLength={LIMITS.description} value={f.description} onChange={set('description')} className={input} {...aria('description')} />
      </Field>
      {/* Honeypot: hidden from people and assistive tech; bots that fill it are rejected by the API. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      </div>
      {failure && <p role="alert" className="text-sm text-danger">{failure}</p>}
      <p id="form-note" className="text-xs text-muted">Do not include passwords or payment details. We use these details only to reply to your request.</p>
      <button type="submit" disabled={busy} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:opacity-60">
        {busy ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}

/** Status lookup by reference + email (POST; the email is never put in a URL). */
export function RequestStatusLookup() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function lookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const res = await fetch('/api/public/request/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ reference: form.get('reference'), email: form.get('lookupEmail') }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { status?: string; message?: string } | null;
    setBusy(false);
    setResult(res?.ok && body?.status ? `Status: ${STATUS_TEXT[body.status] ?? body.status}` : body?.message ?? 'Status could not be checked. Please try again.');
  }
  return (
    <form onSubmit={lookup} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="reference" className="block text-sm text-muted">Reference</label><input id="reference" name="reference" placeholder="REQ-…" required className={input} /></div>
        <div><label htmlFor="lookupEmail" className="block text-sm text-muted">Email</label><input id="lookupEmail" name="lookupEmail" type="email" autoComplete="email" required className={input} /></div>
      </div>
      <button type="submit" disabled={busy} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60">{busy ? 'Checking…' : 'Check status'}</button>
      {result && <p role="status" className="text-sm">{result}</p>}
    </form>
  );
}
