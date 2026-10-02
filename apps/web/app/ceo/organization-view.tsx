import { useState, useEffect } from 'react';
import { API_BASE, authHeaders } from '../lib/api';

export function OrganizationView() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/organization/chart`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return <div className="p-4">Loading organization...</div>;

  return (
    <div className="p-4 border rounded shadow bg-white">
      <h2 className="text-xl font-bold mb-4">Organization Chart</h2>
      <pre className="text-sm bg-gray-50 p-2 overflow-auto max-h-96">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
