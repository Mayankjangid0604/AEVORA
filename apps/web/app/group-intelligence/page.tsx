'use client';

import React, { useState, useEffect } from 'react';

// Stub out Card for build
const Card = ({ children }: any) => <div>{children}</div>;
const CardHeader = ({ children }: any) => <div>{children}</div>;
const CardTitle = ({ children }: any) => <h2>{children}</h2>;
const CardContent = ({ children }: any) => <div>{children}</div>;

export default function GroupIntelligencePage() {
  const token = 'default';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const groupId = 'group-dashboard'; // Simple stub for chairman group

  useEffect(() => {
    if (!token) return;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13000';
    fetch(`${API_BASE}/company-intelligence/group/${groupId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch group intelligence. You must be a Chairman.');
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
  }, [token]);

  if (loading) return <div>Loading group intelligence...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!data) return <div>No data available.</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">V9 Chairman Group Intelligence</h1>
      
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Group Metrics</CardTitle></CardHeader>
          <CardContent>
            <ul>
              <li>Total Revenue across companies: Rs {data.metrics?.totalRevenue || 0}</li>
              <li>Total Workforce across companies: {data.metrics?.totalWorkforce || 0}</li>
              <li>Total Open Ops: {data.metrics?.openOpportunities || 0}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Companies Monitored</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 text-sm text-gray-500">
              {data.provenance?.map((p: any, i: number) => (
                <li key={i}>{p.system} ({p.scope}) - {new Date(p.timestamp).toLocaleString()}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
