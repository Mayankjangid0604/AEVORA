'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import type { OfferView } from '@/lib/types';
import { PageHeader } from './page-header';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

function useOffers(companyId: string) {
  return useQuery({
    queryKey: companyKeys.offers(companyId),
    queryFn: ({ signal }) => bffGet<OfferView[]>('offers', { companyId, signal }),
  });
}

const Tag = ({ children, color = 'accent' }: { children: React.ReactNode; color?: 'accent' | 'warning' | 'purple' }) => {
  const colorClasses = {
    accent: 'border-accent/40 text-accent bg-accent/5',
    warning: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
    purple: 'border-purple-500/40 text-purple-400 bg-purple-500/10',
  }[color];

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-control border px-2 py-0.5 text-[11px] font-medium ${colorClasses}`}>
      {children}
    </span>
  );
};

export function OfferWorkspace({ companyId }: { companyId: string }) {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const q = useOffers(companyId);

  const offers = useMemo(() => q.data || [], [q.data]);

  const filteredOffers = useMemo(() => {
    return offers.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          o.name.toLowerCase().includes(query) ||
          o.targetAudience.toLowerCase().includes(query) ||
          o.description.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [offers, statusFilter, searchQuery]);

  const selectedOffer = useMemo(() => {
    return offers.find((o) => o.id === selectedOfferId) || filteredOffers[0] || null;
  }, [offers, selectedOfferId, filteredOffers]);

  // Summary Metrics
  const activeCount = offers.filter((o) => o.status === 'ACTIVE').length;
  const approvedCount = offers.filter((o) => o.status === 'APPROVED').length;
  const totalRevenue = offers.reduce((acc, o) => acc + (o.financialAnalysis?.expectedRevenue || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offer Market & Autonomous Offer Engine"
        description="Enterprise-governed commercial offer lifecycle: pricing intelligence, CEO recommendation, Sovereign Chairman approval binding, and closed-loop measurement."
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-control border border-border bg-surface p-3">
          <p className="text-xs text-muted">Total Offers</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{offers.length}</p>
        </div>
        <div className="rounded-control border border-border bg-surface p-3">
          <p className="text-xs text-muted">Active in Market</p>
          <p className="mt-1 text-2xl font-semibold text-accent tabular-nums">{activeCount}</p>
        </div>
        <div className="rounded-control border border-border bg-surface p-3">
          <p className="text-xs text-muted">Approved / Pending Activation</p>
          <p className="mt-1 text-2xl font-semibold text-amber-400 tabular-nums">{approvedCount}</p>
        </div>
        <div className="rounded-control border border-border bg-surface p-3">
          <p className="text-xs text-muted">Projected Pipeline Volume</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">${totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search offers or audiences..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs text-text placeholder-muted focus:border-accent focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
          >
            <option value="">All Statuses ({offers.length})</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="APPROVED">APPROVED</option>
            <option value="EVALUATED">EVALUATED</option>
            <option value="DRAFT">DRAFT</option>
            <option value="REVISION_REQUIRED">REVISION_REQUIRED</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Showing {filteredOffers.length} offers</span>
        </div>
      </div>

      {/* Main Content Layout: Offers List + Detailed Inspector */}
      {q.isPending ? (
        <SectionSkeleton label="offer market" />
      ) : q.isError ? (
        <QueryError error={q.error} />
      ) : offers.length === 0 ? (
        <SystemState
          kind="empty"
          title="No commercial offers created"
          detail="Create an offer via Chairman command or allow the AI CEO to propose commercial promotional packages."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Offer Cards */}
          <div className="space-y-3 lg:col-span-5">
            {filteredOffers.map((offer) => {
              const isSelected = selectedOffer?.id === offer.id;
              const discountStr =
                offer.discountType === 'PERCENTAGE' ? `${offer.discountValue}% OFF` : `$${offer.discountValue} OFF`;

              return (
                <div
                  key={offer.id}
                  onClick={() => setSelectedOfferId(offer.id)}
                  className={`cursor-pointer rounded-control border p-4 transition-all duration-150 ${
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-border bg-surface hover:border-border/80 hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-text text-sm">{offer.name}</h4>
                      <p className="mt-0.5 text-xs text-muted line-clamp-1">{offer.description}</p>
                    </div>
                    <StatusBadge status={offer.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Tag color="accent">{discountStr}</Tag>
                    <Tag color={offer.creatorRole === 'CHAIRMAN' ? 'purple' : 'accent'}>
                      {offer.creatorRole === 'CHAIRMAN' ? 'Chairman-Created' : 'CEO-Proposed'}
                    </Tag>
                    {offer.requiresChairmanApproval && (
                      <Tag color="warning">Sovereign Gate: &gt;50% Discount</Tag>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                    <div>
                      <span className="font-semibold text-text">${offer.finalPrice}</span>{' '}
                      <span className="line-through text-muted text-[11px]">${offer.originalPrice}</span>
                    </div>
                    <div className="text-muted text-[11px]">
                      {offer.maxRedemptions
                        ? `${offer.currentRedemptions} / ${offer.maxRedemptions} redeemed`
                        : `${offer.currentRedemptions} redemptions`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Detailed Inspector */}
          <div className="space-y-4 lg:col-span-7">
            {selectedOffer ? (
              <OfferDetailPanel offer={selectedOffer} />
            ) : (
              <SystemState kind="empty" title="Select an offer" detail="Click on an offer card to view detailed commercial intelligence and governance status." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OfferDetailPanel({ offer }: { offer: OfferView }) {
  const fin = offer.financialAnalysis;
  const ceo = offer.ceoEvaluation;

  return (
    <div className="space-y-4 rounded-control border border-border bg-surface p-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-text">{offer.name}</h3>
            <StatusBadge status={offer.status} />
          </div>
          <p className="mt-1 text-xs text-muted">{offer.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Audience: <strong className="text-text">{offer.targetAudience}</strong></span>
            <span>·</span>
            <span>Version: <strong className="text-text">v{offer.version}</strong></span>
            <span>·</span>
            <span>Terms Version: <strong className="text-text">v{offer.termsVersion}</strong></span>
          </div>
        </div>

        {/* Pricing Highlights */}
        <div className="text-right">
          <p className="text-xs text-muted">Promotional Price</p>
          <p className="text-xl font-bold text-accent">${offer.finalPrice}</p>
          <p className="text-xs text-muted line-through">${offer.originalPrice}</p>
        </div>
      </div>

      {/* Governance & Parameter Hash Verification */}
      <div className="rounded-control border border-border/70 bg-surface-2 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-text">Cryptographic Governance Binding:</span>
          {offer.hasApproval ? (
            <span className="text-emerald-400 font-medium">✓ Cryptographically Bound</span>
          ) : (
            <span className="text-amber-400 font-medium">⚠ Pending Sovereign Approval</span>
          )}
        </div>
        {offer.parametersHash && (
          <p className="mt-1.5 font-mono text-[10px] text-muted truncate">
            SHA-256: {offer.parametersHash}
          </p>
        )}
        {offer.requiresChairmanApproval && (
          <div className="mt-2 flex items-center gap-2 text-amber-300">
            <span>⚡ Invariant 4.2 Enforced: Discount exceeds 50% threshold. Sovereign Chairman authority required.</span>
          </div>
        )}
      </div>

      {/* Financial & Commercial Intelligence */}
      {fin && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Commercial Intelligence & Unit Economics
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-control border border-border bg-surface-2 p-2.5">
              <p className="text-[11px] text-muted">Expected Revenue</p>
              <p className="text-sm font-semibold text-text tabular-nums">${fin.expectedRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2.5">
              <p className="text-[11px] text-muted">Incremental Revenue</p>
              <p className="text-sm font-semibold text-emerald-400 tabular-nums">+${fin.incrementalRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2.5">
              <p className="text-[11px] text-muted">Contribution Profit</p>
              <p className="text-sm font-semibold text-accent tabular-nums">${fin.contributionProfit.toLocaleString()}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2.5">
              <p className="text-[11px] text-muted">Post-Discount Margin</p>
              <p className="text-sm font-semibold text-text tabular-nums">{fin.postDiscountMarginPct}%</p>
            </div>
          </div>

          {/* Scenarios Breakdown */}
          <div className="overflow-x-auto rounded-control border border-border text-xs">
            <table className="w-full text-left">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="p-2 font-medium">Scenario</th>
                  <th className="p-2 font-medium text-right">Volume</th>
                  <th className="p-2 font-medium text-right">Revenue</th>
                  <th className="p-2 font-medium text-right">Gross Profit</th>
                  <th className="p-2 font-medium text-right">Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-2 font-medium text-emerald-400">Best-Case (+30%)</td>
                  <td className="p-2 text-right tabular-nums">{fin.scenarios.bestCase.volume}</td>
                  <td className="p-2 text-right tabular-nums">${fin.scenarios.bestCase.revenue.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">${fin.scenarios.bestCase.grossProfit.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-400">${fin.scenarios.bestCase.contributionProfit.toLocaleString()}</td>
                </tr>
                <tr className="bg-surface-2/30">
                  <td className="p-2 font-medium text-text">Expected-Case</td>
                  <td className="p-2 text-right tabular-nums">{fin.scenarios.expectedCase.volume}</td>
                  <td className="p-2 text-right tabular-nums">${fin.scenarios.expectedCase.revenue.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">${fin.scenarios.expectedCase.grossProfit.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">${fin.scenarios.expectedCase.contributionProfit.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-amber-400">Worst-Case (-35%)</td>
                  <td className="p-2 text-right tabular-nums">{fin.scenarios.worstCase.volume}</td>
                  <td className="p-2 text-right tabular-nums">${fin.scenarios.worstCase.revenue.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">${fin.scenarios.worstCase.grossProfit.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums text-amber-400">${fin.scenarios.worstCase.contributionProfit.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {fin.guardrailViolations.length > 0 && (
            <div className="rounded-control border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <p className="font-semibold">Financial Guardrail Alerts:</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px]">
                {fin.guardrailViolations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* CEO Recommendation Engine */}
      {ceo && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
              AI CEO Strategic Recommendation
            </h4>
            <span
              className={`rounded-control px-2 py-0.5 text-xs font-bold ${
                ceo.verdict === 'APPROVE'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : ceo.verdict === 'REVISE'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}
            >
              Verdict: {ceo.verdict}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 text-center text-xs">
            <div className="rounded-control border border-border bg-surface-2 p-2">
              <p className="text-[10px] text-muted">Composite</p>
              <p className="text-sm font-bold text-accent">{ceo.scores.compositeScore}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2">
              <p className="text-[10px] text-muted">Profitability</p>
              <p className="text-sm font-bold text-text">{ceo.scores.profitabilityScore}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2">
              <p className="text-[10px] text-muted">Strategic</p>
              <p className="text-sm font-bold text-text">{ceo.scores.strategicValueScore}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2">
              <p className="text-[10px] text-muted">Risk Score</p>
              <p className="text-sm font-bold text-text">{ceo.scores.riskScore}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2">
              <p className="text-[10px] text-muted">Customer</p>
              <p className="text-sm font-bold text-text">{ceo.scores.customerImpactScore}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-2">
              <p className="text-[10px] text-muted">Feasibility</p>
              <p className="text-sm font-bold text-text">{ceo.scores.operationalFeasibilityScore}</p>
            </div>
          </div>

          <p className="text-xs text-text bg-surface-2 p-3 rounded-control border border-border/50">
            {ceo.explanation.executiveSummary}
          </p>

          <p className="text-[10px] text-muted italic">{ceo.advisoryDisclaimer}</p>
        </div>
      )}

      {/* Versioned Terms & Material History */}
      <div className="border-t border-border pt-3">
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-text hover:text-accent">
            View Current Terms & Conditions ({offer.termsHistory?.length || 1} revisions)
          </summary>
          <div className="mt-2 space-y-2 rounded-control border border-border bg-surface-2 p-3">
            <p className="whitespace-pre-line text-xs text-text">{offer.termsAndConditions}</p>
            {offer.termsHistory && offer.termsHistory.length > 1 && (
              <div className="mt-3 border-t border-border/50 pt-2">
                <p className="font-semibold text-muted text-[11px]">Material Change History:</p>
                <ul className="mt-1 space-y-1 text-[11px] text-muted">
                  {offer.termsHistory.map((h) => (
                    <li key={h.version}>
                      Version {h.version}: {h.changeReason || 'Revised'} by {h.changedBy} (
                      <Timestamp iso={h.changedAt} />)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
