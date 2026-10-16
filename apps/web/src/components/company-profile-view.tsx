'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { bffGet, bffPost } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import type { Company } from '@/lib/types';
import { PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { StatusBadge } from './status-badge';
import { QueryError, SectionSkeleton } from './query-state';

export function CompanyProfileView({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: companyKeys.administration(companyId, 'company-profile'),
    queryFn: ({ signal }) => bffGet<Company>(`companies/${encodeURIComponent(companyId)}`, { companyId, signal }),
  });

  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [description, setDescription] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data) {
      setName(query.data.name || '');
      setLegalName(query.data.legalName || '');
      setDescription(query.data.description || '');
    }
  }, [query.data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Company name cannot be blank.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await bffPost<Company>(
        `companies/${encodeURIComponent(companyId)}/update`,
        {
          name: name.trim(),
          legalName: legalName.trim() || undefined,
          description: description.trim() || undefined,
        },
        { companyId }
      );
      setStatusMessage('Company profile updated successfully.');
      qc.invalidateQueries({ queryKey: companyKeys.administration(companyId, 'company-profile') });
      qc.invalidateQueries({ queryKey: ['auth', 'companies'] });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update company profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Profile &amp; Settings"
        description="View and update your company details. Changes are applied immediately and recorded in the audit trail."
      />

      <Panel title="Profile Details" id="profile-details-title">
        {query.isPending ? (
          <SectionSkeleton label="company profile" />
        ) : query.isError ? (
          <QueryError error={query.error} forbiddenDetail="Only the Chairman or management can view and edit company profile." />
        ) : (
          <form onSubmit={handleSave} className="space-y-4 max-w-xl">
            {statusMessage && (
              <div role="status" className="rounded-control border border-success/40 bg-success/10 p-3 text-xs text-success">
                {statusMessage}
              </div>
            )}
            {errorMessage && (
              <div role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center gap-3 pb-2 text-xs text-muted">
              <span>Status: <StatusBadge status={query.data.status} /></span>
              <span>ID: <code className="font-mono text-text">{query.data.id}</code></span>
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-name" className="text-xs font-medium text-muted">
                Operating Name <span className="text-danger">*</span>
              </label>
              <input
                id="edit-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-legal-name" className="text-xs font-medium text-muted">
                Legal Business Name
              </label>
              <input
                id="edit-legal-name"
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Registered Entity Ltd."
                className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-description" className="text-xs font-medium text-muted">
                Business Description
              </label>
              <textarea
                id="edit-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your business operations, offerings, or industry focus."
                className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-control bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
