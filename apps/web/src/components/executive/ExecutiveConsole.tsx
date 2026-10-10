'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bffGet, bffPost } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/page-header';
import { QueryError } from '@/components/query-state';
import { SystemState } from '@/components/system-state';

import type {
  CeoOperatingState,
  CeoAutonomousDecisionSummary,
  DecisionBrief,
  ProactiveSignal,
  EnterpriseBrainSummary,
  BrainConflict,
  ExternalActionAuditItem,
  StructuredMemoryItem,
  StrategicReflectionReportItem,
  DirectiveEvaluationResult,
  V15SpatialContext,
  V24OfferContext,
} from '@/lib/executive-types';

import { CeoOperatingLoopVisualizer } from './CeoOperatingLoopVisualizer';
import { CeoCommandInterface } from './CeoCommandInterface';
import { CeoDecisionCenter } from './CeoDecisionCenter';
import { DecisionBriefDrawer } from './DecisionBriefDrawer';
import { ChairmanApprovalModal } from './ChairmanApprovalModal';
import { ExternalActionGatewayConsole } from './ExternalActionGatewayConsole';
import { EnterpriseBrainViewer } from './EnterpriseBrainViewer';
import { OrganizationalMemoryConsole } from './OrganizationalMemoryConsole';
import { V15SpatialContextBadge } from './V15SpatialContextBadge';

export type ExecutiveConsoleTab = 'operations' | 'decisions' | 'actions' | 'brain' | 'memory';

interface Props {
  companyId: string;
}

export function ExecutiveConsole({ companyId }: Props) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ExecutiveConsoleTab>('operations');

  // Modal / Drawer state
  const [activeBrief, setActiveBrief] = useState<DecisionBrief | null>(null);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [activeApprovalDecision, setActiveApprovalDecision] = useState<CeoAutonomousDecisionSummary | null>(null);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // 1. Queries
  const stateQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'state'),
    queryFn: ({ signal }) => bffGet<CeoOperatingState>('executive/state', { companyId, signal }),
  });

  const decisionsQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'decisions'),
    queryFn: ({ signal }) => bffGet<CeoAutonomousDecisionSummary[]>('executive/decisions', { companyId, signal }),
  });

  const signalsQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'signals'),
    queryFn: ({ signal }) => bffGet<ProactiveSignal[]>('executive/signals', { companyId, signal }),
  });

  const brainQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'brain'),
    queryFn: ({ signal }) => bffGet<{ summary: EnterpriseBrainSummary; conflicts: BrainConflict[] }>('executive/brain', { companyId, signal }),
  });

  const actionsQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'actions'),
    queryFn: ({ signal }) => bffGet<ExternalActionAuditItem[]>('executive/actions', { companyId, signal }),
  });

  const memoryQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'memory'),
    queryFn: ({ signal }) => bffGet<StructuredMemoryItem[]>('executive/memory', { companyId, signal }),
  });

  const reflectionQuery = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'reflection'),
    queryFn: ({ signal }) => bffGet<StrategicReflectionReportItem>('executive/reflection', { companyId, signal }),
  });

  const v15Query = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'v15'),
    queryFn: ({ signal }) => bffGet<V15SpatialContext>('executive/v15-context', { companyId, signal }),
  });

  const v24Query = useQuery({
    queryKey: companyKeys.ceo(companyId, 'console', 'v24'),
    queryFn: ({ signal }) => bffGet<V24OfferContext>('executive/v24-context', { companyId, signal }),
  });

  // 2. Mutations
  const runLoopMutation = useMutation({
    mutationFn: () => bffPost('executive/loop/run', {}, { companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId) });
      setFeedbackNotice('Autonomous operating loop executed successfully.');
    },
    onError: (err: any) => {
      setFeedbackNotice(`Operating loop failed: ${err.message}`);
    },
  });

  const submitObjectiveMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      bffPost('executive/objective/create', data, { companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId) });
      setFeedbackNotice('Strategic objective issued to Autonomous CEO.');
    },
  });

  const evaluateDirective = async (directive: string): Promise<DirectiveEvaluationResult | null> => {
    try {
      const res = await bffPost<DirectiveEvaluationResult>('executive/directive/evaluate', { directive }, { companyId });
      return res;
    } catch (err: any) {
      setFeedbackNotice(`Directive evaluation failed: ${err.message}`);
      return null;
    }
  };

  const compareDisagreement = async (directive: string, alternative: string) => {
    return bffPost('executive/directive/disagreement', { directive, alternative }, { companyId });
  };

  const openBrief = async (decisionId: string) => {
    try {
      const brief = await bffGet<DecisionBrief>(`executive/decision-brief/${decisionId}`, { companyId });
      setActiveBrief(brief);
      setIsBriefOpen(true);
    } catch (err: any) {
      setFeedbackNotice(`Failed to load decision brief: ${err.message}`);
    }
  };

  const resolveApprovalMutation = useMutation({
    mutationFn: (data: { decisionId: string; resolution: 'APPROVED' | 'REJECTED'; reason: string }) =>
      bffPost(`executive/decision/${data.resolution === 'APPROVED' ? 'approve' : 'reject'}/${data.decisionId}`, { reason: data.reason }, { companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId) });
      setIsApprovalOpen(false);
      setIsBriefOpen(false);
      setFeedbackNotice('Decision resolution recorded by Chairman.');
    },
    onError: (err: any) => {
      setFeedbackNotice(`Approval failed: ${err.message}`);
    },
  });

  const executeDecisionMutation = useMutation({
    mutationFn: (decisionId: string) =>
      bffPost(`executive/decision/execute/${decisionId}`, {}, { companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId) });
      setIsBriefOpen(false);
      setFeedbackNotice('Authorized decision dispatched to External Action Gateway.');
    },
    onError: (err: any) => {
      setFeedbackNotice(`Execution rejected: ${err.message}`);
    },
  });

  const triggerReflectionMutation = useMutation({
    mutationFn: () => bffPost('executive/memory/reflect', {}, { companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId, 'console', 'reflection') });
      queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId, 'console', 'memory') });
      setFeedbackNotice('Strategic reflection executed and memory patterns updated.');
    },
  });

  const recordOutcomeFeedback = async (actionId: string, outcomeMetrics: any) => {
    await bffPost('executive/memory/evaluate', { decisionId: actionId, actualMetrics: outcomeMetrics }, { companyId });
    queryClient.invalidateQueries({ queryKey: companyKeys.ceo(companyId, 'console', 'actions') });
    setFeedbackNotice('Real-world outcome recorded and calibrated in Organizational Memory.');
  };

  if (stateQuery.isError) {
    return <QueryError error={stateQuery.error} />;
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Autonomous CEO & Executive Console"
        description="AEVORA V16 autonomous operating loop: real-time consequence analysis, 4-tier risk gateway, and closed-loop organizational memory."
      />

      {/* V15 Spatial Digital-Twin Context Badge */}
      <V15SpatialContextBadge companyId={companyId} spatial={v15Query.data} />

      {/* Temporary feedback banner */}
      {feedbackNotice && (
        <div className="flex items-center justify-between rounded-control border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-text">
          <span>{feedbackNotice}</span>
          <button
            type="button"
            onClick={() => setFeedbackNotice(null)}
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        </div>
      )}

      {/* Master Navigation Tabs */}
      <div className="flex border-b border-border text-xs">
        {[
          { key: 'operations', label: 'Command & Operations' },
          { key: 'decisions', label: `Decisions & Lifecycle (${decisionsQuery.data?.length ?? 0})` },
          { key: 'actions', label: `Action Gateway & V24 (${actionsQuery.data?.length ?? 0})` },
          { key: 'brain', label: 'Enterprise Brain & Topology' },
          { key: 'memory', label: `Memory & Reflection (${memoryQuery.data?.length ?? 0})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as ExecutiveConsoleTab)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Command & Operations */}
      {activeTab === 'operations' && (
        <div className="space-y-4">
          <CeoOperatingLoopVisualizer
            state={stateQuery.data}
            isLoading={stateQuery.isPending}
            onRunLoop={() => runLoopMutation.mutate()}
            isExecutingLoop={runLoopMutation.isPending}
          />

          <CeoCommandInterface
            state={stateQuery.data}
            onSubmitObjective={async (t, d) => {
              await submitObjectiveMutation.mutateAsync({ title: t, description: d });
            }}
            onEvaluateDirective={evaluateDirective}
            onCompareDisagreement={compareDisagreement}
          />

          {/* Proactive Signals & Alerts */}
          {signalsQuery.data && signalsQuery.data.length > 0 && (
            <section aria-label="Proactive CEO Signals" className="rounded-panel border border-border bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Proactive Attention Signals & Opportunities
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {signalsQuery.data.map((sig) => (
                  <div key={sig.id} className="rounded-control border border-border/80 bg-surface-2/40 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded-control border px-1.5 py-0.5 text-[10px] font-semibold ${
                          sig.severity === 'CRITICAL'
                            ? 'border-danger bg-danger-soft text-danger'
                            : sig.severity === 'HIGH'
                            ? 'border-warn bg-warn-soft text-warn'
                            : 'border-accent bg-accent-soft text-accent'
                        }`}
                      >
                        {sig.severity} {sig.type}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(sig.detectedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-1.5 font-medium text-text">{sig.title}</p>
                    <p className="mt-0.5 text-muted">{sig.description}</p>
                    {sig.recommendedAction && (
                      <p className="mt-1.5 text-[11px] text-accent">
                        <strong>Action: </strong>{sig.recommendedAction}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Tab 2: Decision Center & Consequence Briefs */}
      {activeTab === 'decisions' && (
        <CeoDecisionCenter
          decisions={decisionsQuery.data || []}
          isLoading={decisionsQuery.isPending}
          onOpenBrief={openBrief}
          onOpenApproval={(d) => {
            setActiveApprovalDecision(d);
            setIsApprovalOpen(true);
          }}
          onExecuteDecision={(id) => executeDecisionMutation.mutate(id)}
          isExecutingDecision={executeDecisionMutation.isPending}
        />
      )}

      {/* Tab 3: Action Gateway & V24 Offer Engine */}
      {activeTab === 'actions' && (
        <ExternalActionGatewayConsole
          actions={actionsQuery.data || []}
          v24Context={v24Query.data}
          isLoading={actionsQuery.isPending}
          onRecordOutcomeFeedback={recordOutcomeFeedback}
        />
      )}

      {/* Tab 4: Enterprise Brain & Topology */}
      {activeTab === 'brain' && (
        <EnterpriseBrainViewer
          brain={brainQuery.data?.summary}
          conflicts={brainQuery.data?.conflicts || []}
          isLoading={brainQuery.isPending}
        />
      )}

      {/* Tab 5: Memory & Reflection */}
      {activeTab === 'memory' && (
        <OrganizationalMemoryConsole
          memories={memoryQuery.data || []}
          reflection={reflectionQuery.data || null}
          isLoading={memoryQuery.isPending}
          onTriggerReflection={async () => {
            await triggerReflectionMutation.mutateAsync();
          }}
        />
      )}

      {/* Decision Brief Drawer */}
      <DecisionBriefDrawer
        brief={activeBrief}
        isOpen={isBriefOpen}
        onClose={() => setIsBriefOpen(false)}
        onApprove={(id) => {
          if (activeBrief) {
            setActiveApprovalDecision({
              id,
              type: activeBrief.decisionType,
              title: activeBrief.title,
              status: activeBrief.status,
              riskTier: activeBrief.consequenceAnalysis.riskTier,
              urgency: activeBrief.urgency,
              createdAt: activeBrief.createdAt,
              netScore: activeBrief.consequenceAnalysis.netScore,
              recommendation: activeBrief.consequenceAnalysis.recommendation,
              needsChairmanApproval: true,
            });
            setIsApprovalOpen(true);
          }
        }}
        onReject={(id) => {
          resolveApprovalMutation.mutate({ decisionId: id, resolution: 'REJECTED', reason: 'Chairman rejected brief.' });
        }}
        onExecute={(id) => executeDecisionMutation.mutate(id)}
        isProcessingAction={executeDecisionMutation.isPending || resolveApprovalMutation.isPending}
      />

      {/* Chairman Approval Modal */}
      <ChairmanApprovalModal
        decision={activeApprovalDecision}
        isOpen={isApprovalOpen}
        onClose={() => setIsApprovalOpen(false)}
        onResolve={async (id, resolution, reason) => {
          await resolveApprovalMutation.mutateAsync({ decisionId: id, resolution, reason });
        }}
        isProcessing={resolveApprovalMutation.isPending}
      />
    </div>
  );
}
