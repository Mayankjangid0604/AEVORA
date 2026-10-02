"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ProprietaryModelsPage() {
  const [capabilities, setCapabilities] = useState<any[]>([]);

  useEffect(() => {
    // In a real implementation this would fetch from /api/chairman/research/models
    // For now we mock the Multi-Model Phase 20 state
    setCapabilities([
      {
        id: "cap-1",
        name: "TASK_PRIORITY_CLASSIFICATION",
        description: "Infers priority for new or ambiguous tasks.",
        activeDeployment: "AEVORA Task Priority Model v1.1.0",
        status: "ACTIVE",
        confidenceThreshold: 0.70,
        latencyTarget: 150,
        metrics: {
          successRate: "98.5%",
          fallbackRate: "1.5%",
          avgLatency: "65ms"
        }
      },
      {
        id: "cap-2",
        name: "TASK_RISK_CLASSIFICATION",
        description: "Identifies high-risk factors in execution workload.",
        activeDeployment: "Task Risk Model v1.0.0",
        status: "ACTIVE",
        confidenceThreshold: 0.85,
        latencyTarget: 200,
        metrics: {
          successRate: "94.2%",
          fallbackRate: "5.8%",
          avgLatency: "80ms"
        }
      }
    ]);
  }, []);

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">AI Capabilities & Orchestration</h1>
      <p className="text-muted-foreground">Governed multi-model intelligence platform for automated business logic.</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {capabilities.map(cap => (
          <Card key={cap.id} className="shadow-lg border border-primary/20">
            <CardHeader className="bg-primary/5">
              <CardTitle className="flex justify-between items-center text-lg">
                {cap.name}
                <Badge variant={cap.status === 'ACTIVE' ? 'default' : 'secondary'}>{cap.status}</Badge>
              </CardTitle>
              <div className="text-sm text-muted-foreground mt-2">{cap.description}</div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-semibold">Active Orchestration Model</span>
                <span className="text-sm bg-blue-100 text-blue-800 p-2 rounded-md font-mono">{cap.activeDeployment}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <div className="text-xs text-muted-foreground">Confidence Threshold</div>
                  <div className="font-semibold">{cap.confidenceThreshold * 100}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Latency Target</div>
                  <div className="font-semibold">{cap.latencyTarget}ms</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-sm mb-2 text-green-700">Telemetry & Fallback</h4>
                <div className="grid grid-cols-3 gap-2 text-sm text-center">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="font-bold text-lg">{cap.metrics.successRate}</div>
                    <div className="text-xs text-muted-foreground">Success</div>
                  </div>
                  <div className="bg-orange-50 p-2 rounded">
                    <div className="font-bold text-lg text-orange-600">{cap.metrics.fallbackRate}</div>
                    <div className="text-xs text-muted-foreground">Fallback Used</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="font-bold text-lg">{cap.metrics.avgLatency}</div>
                    <div className="text-xs text-muted-foreground">Avg Latency</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
