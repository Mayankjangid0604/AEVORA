'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { bffPost } from '@/lib/bff-client';
import type { Company } from '@/lib/types';

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Company name is required');
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await bffPost<Company>(
        'companies',
        {
          name: name.trim(),
          legalName: legalName.trim() || undefined,
          description: description.trim() || undefined,
        },
        // For new company creation, companyId can be empty as policy allows companyOptional
        { companyId: '' }
      );
      setOpen(false);
      setName('');
      setLegalName('');
      setDescription('');
      if (res?.id) {
        router.push(`/company/${encodeURIComponent(res.id)}`);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create company');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
        >
          <span aria-hidden="true">+</span> Create New Company
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-panel border border-border bg-surface p-5 space-y-4 max-w-lg"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text">Create New Company</h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="text-xs text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>

          {error && (
            <div role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="company-name" className="text-xs font-medium text-muted">
              Company Name <span className="text-danger">*</span>
            </label>
            <input
              id="company-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Innovations"
              className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="company-legal-name" className="text-xs font-medium text-muted">
              Legal Business Name (optional)
            </label>
            <input
              id="company-legal-name"
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Acme Innovations Pvt. Ltd."
              className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="company-description" className="text-xs font-medium text-muted">
              Description (optional)
            </label>
            <textarea
              id="company-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does your company do?"
              className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-control border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-control bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create Company'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
