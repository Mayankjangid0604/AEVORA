'use client';

import React, { useState } from 'react';
import type { CeoAutonomousDecisionSummary, DecisionRiskTier } from '@/lib/executive-types';

interface Props {
  decision: CeoAutonomousDecisionSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (decisionId: string, resolution: 'APPROVED' | 'REJECTED', reason: string) => Promise<void>;
  isProcessing: boolean;
}

export function ChairmanApprovalModal({
  decision,
  isOpen,
  onClose,
  onResolve,
  isProcessing,
}: Props) {
  const [reason, setReason] = useState('');
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [resolutionType, setResolutionType] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

  if (!isOpen || !decision) return null;

  const isCritical = decision.riskTier === 'CRITICAL';
  const isHigh = decision.riskTier === 'HIGH';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCritical && resolutionType === 'APPROVED' && !criticalConfirmed) {
      return;
    }
    await onResolve(decision.id, resolutionType, reason.trim());
    setReason('');
    setCriticalConfirmed(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-modal-title"
        className="w-full max-w-lg rounded-panel border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-control border px-2 py-0.5 text-[11px] font-semibold ${
                  isCritical
                    ? 'border-danger bg-danger-soft text-danger'
                    : isHigh
                    ? 'border-warn bg-warn-soft text-warn'
                    : 'border-accent bg-accent-soft text-accent'
                }`}
              >
                {decision.riskTier} RISK ACTION
              </span>
              <span className="text-xs text-muted">Approval Gate</span>
            </div>
            <h3 id="approval-modal-title" className="mt-1 text-sm font-semibold text-text">
              Chairman Review: {decision.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div className="rounded-control border border-border/80 bg-surface-2/40 p-3">
            <p className="font-semibold text-text">Decision Details & Intent</p>
            <p className="mt-0.5 text-muted">{decision.recommendation || 'Action awaiting executive verification.'}</p>
            <div className="mt-2 flex items-center justify-between text-muted">
              <span>Type: <strong className="text-text">{decision.type}</strong></span>
              <span>Consequence Net Score: <strong className="text-text">{decision.netScore}</strong></span>
            </div>
          </div>

          {/* Two-step safeguard for CRITICAL actions */}
          {isCritical && resolutionType === 'APPROVED' && (
            <div className="rounded-control border border-danger/40 bg-danger-soft/30 p-3">
              <p className="font-semibold text-danger">⚠️ Secondary Chairman Safeguard Required</p>
              <p className="mt-1 text-muted">
                This action is classified as <strong>CRITICAL</strong>. In accordance with AEVORA governance, this
                action involves permanent or multi-system financial exposure.
              </p>
              <label className="mt-2.5 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={criticalConfirmed}
                  onChange={(e) => setCriticalConfirmed(e.target.checked)}
                  className="mt-0.5 rounded-xs border-border"
                />
                <span className="text-text font-medium leading-tight">
                  I explicitly confirm this CRITICAL corporate action and assume executive responsibility.
                </span>
              </label>
            </div>
          )}

          <div>
            <label htmlFor="chairman-notes" className="block font-medium text-text">
              Chairman Stipulations or Rejection Rationale
            </label>
            <textarea
              id="chairman-notes"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Record explicit instructions, operational limits, or reason for rejection..."
              className="mt-1 w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-xs text-text placeholder-muted/60 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isProcessing}
              onClick={() => setResolutionType('REJECTED')}
              className="rounded-control border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-50"
            >
              Reject Action
            </button>

            <button
              type="submit"
              disabled={isProcessing || (isCritical && !criticalConfirmed)}
              onClick={() => setResolutionType('APPROVED')}
              className="rounded-control bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              {isProcessing ? 'Recording Gate...' : 'Authorize & Sign Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
