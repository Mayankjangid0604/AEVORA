'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch, setCompanyHeader } from '../lib/api';
import { Buildings, CaretDown, Check } from '@phosphor-icons/react';

export default function CompanyContextSelector() {
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chairmanFetch('/groups').then(res => {
      if (res.data) setGroups(res.data);
      setLoading(false);
    });

    const stored = localStorage.getItem('aevora_company_id');
    if (stored) {
      setSelectedCompanyId(stored);
      setCompanyHeader(stored);
    }
  }, []);

  const handleSelect = (id: string | null) => {
    setSelectedCompanyId(id);
    setCompanyHeader(id);
    setIsOpen(false);
    if (id) {
      localStorage.setItem('aevora_company_id', id);
    } else {
      localStorage.removeItem('aevora_company_id');
    }
    // Refresh page to apply new context
    window.location.reload();
  };

  if (loading) return <div className="company-selector loading">Loading...</div>;
  if (!groups || groups.length === 0) return null;

  const currentGroup = groups[0]; 

  let currentName = 'Group View';
  if (selectedCompanyId) {
    const comp = currentGroup.companies?.find((c: any) => c.id === selectedCompanyId);
    if (comp) currentName = comp.name;
  }

  return (
    <div className="company-context-selector" style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)' }}>
      <button className="context-btn" onClick={() => setIsOpen(!isOpen)} style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Buildings size={16} />
          <span>{currentName}</span>
        </div>
        <CaretDown size={12} />
      </button>

      {isOpen && (
        <div className="context-menu" style={{ position: 'absolute', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '4px', width: '200px', zIndex: 10, padding: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', padding: '0 0.5rem' }}>{currentGroup.name}</div>
          <button 
            style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0.5rem', background: !selectedCompanyId ? 'var(--bg-active)' : 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}
            onClick={() => handleSelect(null)}
          >
            <span>Group Overview</span>
            {!selectedCompanyId && <Check size={14} />}
          </button>
          
          <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />
          
          {currentGroup.companies?.map((c: any) => (
            <button 
              key={c.id} 
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0.5rem', background: selectedCompanyId === c.id ? 'var(--bg-active)' : 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}
              onClick={() => handleSelect(c.id)}
            >
              <span>{c.name}</span>
              {selectedCompanyId === c.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
