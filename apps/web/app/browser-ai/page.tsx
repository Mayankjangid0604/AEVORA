'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BrowserProfile {
  id: string;
  name: string;
  employeeId?: string;
  chromeProfileDirectory: string;
  status: string;
  browserType: string;
  enabled: boolean;
  lastUsedAt?: string;
}

export default function BrowserAiDashboard() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/proxy/browser-ai/profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data);
      }
    } catch (error) {
      console.error('Error fetching browser profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleAction = async (profileId: string, action: string) => {
    try {
      await fetch(`/api/proxy/browser-ai/profiles/${profileId}/${action}`, {
        method: 'POST',
      });
      fetchProfiles();
    } catch (error) {
      console.error(`Error performing ${action} on profile:`, error);
    }
  };

  if (loading) return <div className="p-8">Loading Browser Profiles...</div>;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browser AI Profiles</h1>
        <p className="text-muted-foreground mt-2">
          Manage Chrome profiles assigned to AI employees for browser automation tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((profile) => (
          <Card key={profile.id} className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">{profile.name}</CardTitle>
                <div className={`px-2 py-1 text-xs rounded-full font-medium
                  ${profile.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : 
                    profile.status === 'BUSY' ? 'bg-blue-100 text-blue-800' : 
                    profile.status === 'ERROR' ? 'bg-red-100 text-red-800' : 
                    'bg-slate-100 text-slate-800'}`}>
                  {profile.status}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm">
                  <div className="flex justify-between text-muted-foreground mb-1">
                    <span>Employee ID</span>
                    <span className="font-mono">{profile.employeeId || 'Unassigned'}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground mb-1">
                    <span>Browser</span>
                    <span>{profile.browserType}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Last Used</span>
                    <span>{profile.lastUsedAt ? new Date(profile.lastUsedAt).toLocaleString() : 'Never'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {profile.status === 'AVAILABLE' && profile.employeeId && (
                    <button className="btn btn-outline" style={{ fontSize: 'var(--text-sm)' }} onClick={() => handleAction(profile.id, 'open')}>
                      Open Browser
                    </button>
                  )}
                  {profile.status === 'BUSY' && (
                    <button className="btn btn-danger" style={{ fontSize: 'var(--text-sm)' }} onClick={() => handleAction(profile.id, 'close')}>
                      Disconnect
                    </button>
                  )}
                  {profile.employeeId ? (
                    <button className="btn btn-neutral" style={{ fontSize: 'var(--text-sm)' }} onClick={() => handleAction(profile.id, 'release')}>
                      Release
                    </button>
                  ) : (
                    <button className="btn btn-neutral" style={{ fontSize: 'var(--text-sm)' }} onClick={() => {
                      // Note: In real implementation, this would open a modal to select an employee
                      const empId = prompt('Enter Employee ID:');
                      if (empId) {
                        fetch(`/api/proxy/browser-ai/profiles/${profile.id}/assign`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ employeeId: empId })
                        }).then(fetchProfiles);
                      }
                    }}>
                      Assign
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {profiles.length === 0 && (
          <div className="col-span-full text-center p-12 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
            No browser profiles found. Check database or configuration.
          </div>
        )}
      </div>
    </div>
  );
}
