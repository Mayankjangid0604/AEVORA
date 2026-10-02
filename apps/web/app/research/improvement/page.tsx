"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AutonomousImprovementPage() {
  const [signals, setSignals] = useState<any[]>([]);
  const [hypotheses, setHypotheses] = useState<any[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);

  useEffect(() => {
    // In a real implementation this would fetch from /api/chairman/research/improvement
    // For now we mock it based on Phase 19 requirements
    setSignals([
      {
        id: "sig-1",
        model: "AEVORA Task Intelligence Model",
        signalType: "FEEDBACK_DISAGREEMENT",
        severity: "HIGH",
        metric: "Rejected Feedback Count",
        observedValue: 12,
        baselineValue: 5,
        status: "OPEN"
      }
    ]);
    
    setHypotheses([
      {
        id: "hyp-1",
        problemStatement: "Observed FEEDBACK_DISAGREEMENT with severity HIGH.",
        hypothesis: "Retraining the model on recently rejected task feedback will reduce prediction errors.",
        expectedImprovement: "Reduce Rejected Feedback Count below 5",
        status: "PROPOSED"
      }
    ]);

    setComparisons([
      {
        id: "comp-1",
        experimentPlanId: "exp-1",
        baselineVersionId: "v1.0.0",
        candidateVersionId: "v2.0.0",
        accuracyChange: "+4.5%",
        latencyChange: "+2ms",
        regressionDetected: false,
        overallResult: "PASS"
      }
    ]);
  }, []);

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Autonomous AI Improvement & R&D Loop</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg border-2 border-red-500/20">
          <CardHeader>
            <CardTitle>Active Improvement Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {signals.map(signal => (
              <div key={signal.id} className="p-4 border rounded bg-gray-50/5">
                <div className="flex justify-between items-center mb-2">
                  <strong className="text-red-500">{signal.signalType}</strong>
                  <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">{signal.severity}</span>
                </div>
                <div className="text-sm">Model: {signal.model}</div>
                <div className="text-sm text-gray-500">Metric: {signal.metric} (Observed: {signal.observedValue}, Baseline: {signal.baselineValue})</div>
                <div className="mt-2 text-right">
                  <button className="bg-primary text-primary-foreground px-3 py-1 text-xs rounded">Create Hypothesis</button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-lg border-2 border-blue-500/20">
          <CardHeader>
            <CardTitle>Research Hypotheses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hypotheses.map(hyp => (
              <div key={hyp.id} className="p-4 border rounded bg-gray-50/5">
                <div className="flex justify-between items-center mb-2">
                  <strong>Hypothesis</strong>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{hyp.status}</span>
                </div>
                <div className="text-sm italic text-gray-600 mb-2">&quot;{hyp.hypothesis}&quot;</div>
                <div className="text-sm text-gray-500">Expected: {hyp.expectedImprovement}</div>
                <div className="mt-2 text-right">
                  <button className="bg-primary text-primary-foreground px-3 py-1 text-xs rounded">Propose Research</button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-lg border-2 border-green-500/20 lg:col-span-2">
          <CardHeader>
            <CardTitle>Candidate Comparisons & Deployment Proposals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {comparisons.map(comp => (
              <div key={comp.id} className="p-4 border rounded bg-gray-50/5">
                <div className="flex justify-between items-center mb-2">
                  <strong>Baseline {comp.baselineVersionId} vs Candidate {comp.candidateVersionId}</strong>
                  <span className={`text-xs px-2 py-1 rounded ${comp.overallResult === 'PASS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{comp.overallResult}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mt-4">
                  <div><strong>Accuracy Change:</strong> <span className="text-green-600">{comp.accuracyChange}</span></div>
                  <div><strong>Latency Change:</strong> <span className="text-gray-600">{comp.latencyChange}</span></div>
                  <div><strong>Regressions:</strong> {comp.regressionDetected ? <span className="text-red-500">Yes</span> : <span className="text-green-500">None</span>}</div>
                </div>
                <div className="mt-4 border-t pt-4 text-right">
                  <button className="bg-green-600 text-white px-4 py-2 text-sm rounded hover:bg-green-700">Approve Deployment</button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
