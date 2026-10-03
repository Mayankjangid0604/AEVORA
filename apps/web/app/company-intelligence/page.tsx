'use client';

import React, { useState, useEffect } from 'react';

// Stub out Card for build
const Card = ({ children }: any) => <div>{children}</div>;
const CardHeader = ({ children }: any) => <div>{children}</div>;
const CardTitle = ({ children }: any) => <h2>{children}</h2>;
const CardContent = ({ children }: any) => <div>{children}</div>;

export default function CompanyIntelligencePage() {
  const companyId = 'default';
  const token = 'default';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!companyId || !token) return;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13000';
    fetch(`${API_BASE}/company-intelligence/company/${companyId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch intelligence');
        return res.json();
      })
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [companyId, token]);

  if (!companyId) return <div>Select a company first.</div>;
  if (loading) return <div>Loading intelligence...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!data) return <div>No data available.</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">V9 Company Intelligence</h1>
      
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Metrics</CardTitle></CardHeader>
          <CardContent>
            <ul>
              <li>Revenue: Rs {data.metrics?.totalRevenue || 0}</li>
              <li>Workforce: {data.metrics?.totalWorkforce || 0}</li>
              <li>Open Ops: {data.metrics?.openOpportunities || 0}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Freshness</CardTitle></CardHeader>
          <CardContent>
            <ul>
              {Object.entries(data.sourceFreshness || {}).map(([src, ts]: any) => (
                <li key={src}>{src}: {new Date(ts).toLocaleTimeString()}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Limitations / Missing</CardTitle></CardHeader>
          <CardContent>
            {data.missingData?.length > 0 ? (
              <ul className="text-yellow-600 list-disc pl-4">
                {data.missingData.map((m: string, i: number) => <li key={i}>{m}</li>)}
              </ul>
            ) : (
              <p>No missing data reported.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Facts & Observations</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc pl-4 space-y-2">
            {data.facts?.map((f: any, i: number) => (
              <li key={i}>{f.statement} (Confidence: {f.confidence})</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Risks & Anomalies</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc pl-4 space-y-2 text-red-500">
            {data.risks?.map((r: any, i: number) => (
              <li key={i}>{r.title}: {r.count} risks identified</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Provenance</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc pl-4 text-sm text-gray-500">
            {data.provenance?.map((p: any, i: number) => (
              <li key={i}>{p.system} ({p.scope}) - {new Date(p.timestamp).toLocaleString()}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
