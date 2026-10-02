'use client';

import { useState } from 'react';

type BuStatus = 'DRAFT' | 'ACTIVE' | 'UNDER_REVIEW' | 'RESTRUCTURING' | 'SUSPENDED' | 'RETIRED';
type BuLifecycle = 'CHARTER' | 'STRATEGY' | 'OBJECTIVES' | 'WORKFORCE' | 'OPERATIONS' | 'PERFORMANCE' | 'REVIEW' | 'RETIRED';

interface BusinessUnit {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: BuStatus;
  lifecycle: BuLifecycle;
  leaderId?: string;
  isAdvisory: boolean;
}

const STATUS_COLORS: Record<BuStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
  RESTRUCTURING: 'bg-orange-100 text-orange-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  RETIRED: 'bg-slate-100 text-slate-500',
};

const LIFECYCLE_COLORS: Record<BuLifecycle, string> = {
  CHARTER: 'bg-blue-50 text-blue-600',
  STRATEGY: 'bg-purple-50 text-purple-600',
  OBJECTIVES: 'bg-indigo-50 text-indigo-600',
  WORKFORCE: 'bg-cyan-50 text-cyan-600',
  OPERATIONS: 'bg-green-50 text-green-600',
  PERFORMANCE: 'bg-teal-50 text-teal-600',
  REVIEW: 'bg-amber-50 text-amber-600',
  RETIRED: 'bg-slate-50 text-slate-400',
};

const MOCK_BUS: BusinessUnit[] = [
  { id: '1', name: 'Technology', code: 'TECH', status: 'ACTIVE', lifecycle: 'OPERATIONS', isAdvisory: false },
  { id: '2', name: 'Operations', code: 'OPS', status: 'ACTIVE', lifecycle: 'PERFORMANCE', isAdvisory: false },
  { id: '3', name: 'Growth', code: 'GRW', status: 'DRAFT', lifecycle: 'CHARTER', isAdvisory: false },
];

type Tab = 'portfolio' | 'detail' | 'governance' | 'audit';

export default function BusinessUnitsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolio');
  const [selectedBu, setSelectedBu] = useState<BusinessUnit | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Autonomous Business Units</h1>
          <p className="text-sm text-gray-500 mt-1">Phase 35 — Business unit portfolio, governance, and performance</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            {(['portfolio', 'detail', 'governance', 'audit'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'portfolio' && (
          <div>
            <div className="grid gap-4">
              {MOCK_BUS.map(bu => (
                <div
                  key={bu.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => { setSelectedBu(bu); setActiveTab('detail'); }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                      {bu.code.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{bu.name}</div>
                      <div className="text-xs text-gray-400">{bu.code}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${LIFECYCLE_COLORS[bu.lifecycle]}`}>
                      {bu.lifecycle}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[bu.status]}`}>
                      {bu.status}
                    </span>
                    {/* Health indicator */}
                    <div className={`w-2 h-2 rounded-full ${bu.status === 'ACTIVE' ? 'bg-green-400' : bu.status === 'DRAFT' ? 'bg-gray-300' : 'bg-red-400'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'detail' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            {selectedBu ? (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                    {selectedBu.code.slice(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedBu.name}</h2>
                    <div className="flex gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${LIFECYCLE_COLORS[selectedBu.lifecycle]}`}>
                        {selectedBu.lifecycle}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[selectedBu.status]}`}>
                        {selectedBu.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {['Objectives', 'KPIs', 'Budget', 'Risks'].map(section => (
                    <div key={section} className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-700 mb-2">{section}</h3>
                      <p className="text-sm text-gray-400">No {section.toLowerCase()} recorded</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p>Select a business unit from Portfolio to view details</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'governance' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Governance</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Capital Requests</h3>
                <p className="text-sm text-gray-400">No capital requests pending</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Performance Reviews</h3>
                <p className="text-sm text-gray-400">No reviews scheduled</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Pending Approvals</h3>
                <p className="text-sm text-gray-400">No pending approvals</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Audit Trail</h2>
            <p className="text-sm text-gray-400">Audit events will appear here. Select a BU to filter by unit.</p>
          </div>
        )}
      </div>
    </div>
  );
}
