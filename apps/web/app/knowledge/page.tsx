'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';

export default function KnowledgePage() {
  const [knowledgeList, setKnowledgeList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'CANONICAL' | 'CANDIDATE'>('CANONICAL');
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [provenance, setProvenance] = useState<any | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    // Bootstrapping auth no longer needed, using JWT token.
    if (!getToken()) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const res = await api.knowledge();
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      const filtered = (res.data.data || []).filter((r: any) => 
        activeTab === 'CANONICAL' 
          ? ['CANONICAL', 'VALIDATED'].includes(r.status) 
          : r.status === 'CANDIDATE'
      );
      setKnowledgeList(filtered);
    }
    setLoading(false);
  }

  async function handleSelectRecord(record: any) {
    setSelectedRecord(record);
    const provRes = await api.knowledgeProvenance(record.id);
    if (provRes.data) {
      setProvenance(provRes.data);
    }
  }

  async function handleValidate(id: string, result: 'SUPPORTED' | 'UNSUPPORTED') {
    const res = await api.validateKnowledge(id, result);
    if (!res.error) {
      setSelectedRecord(null);
      loadData();
    } else {
      alert('Error validating knowledge: ' + res.error);
    }
  }

  if (loading) return <div className="loading">Loading Knowledge Base...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="knowledge-page">
      <header className="page-header">
        <h1>Company Knowledge Base</h1>
        <p>Institutional Memory & Truth Governance</p>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'CANONICAL' ? 'active' : ''}`}
          onClick={() => setActiveTab('CANONICAL')}
        >
          Canonical Knowledge
        </button>
        <button 
          className={`tab ${activeTab === 'CANDIDATE' ? 'active' : ''}`}
          onClick={() => setActiveTab('CANDIDATE')}
        >
          Pending Validation (Candidates)
        </button>
      </div>

      <div className="content-grid">
        <div className="knowledge-list">
          {knowledgeList.length === 0 ? (
            <div className="empty-state">No records found.</div>
          ) : (
            knowledgeList.map(record => (
              <div 
                key={record.id} 
                className={`knowledge-card ${selectedRecord?.id === record.id ? 'selected' : ''}`}
                onClick={() => handleSelectRecord(record)}
              >
                <div className="card-header">
                  <span className="badge">{record.type}</span>
                  <span className={`status-badge status-${record.status.toLowerCase()}`}>{record.status}</span>
                </div>
                <h3>{record.title}</h3>
                <p className="summary">{record.summary}</p>
                <div className="card-footer">
                  <span>Confidence: {record.confidence}%</span>
                  <span>Importance: {record.importance}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedRecord && (
          <div className="knowledge-details">
            <h2>{selectedRecord.title}</h2>
            <div className="meta-info">
              <span className="badge">{selectedRecord.type}</span>
              <span className={`status-badge status-${selectedRecord.status.toLowerCase()}`}>{selectedRecord.status}</span>
            </div>
            
            <div className="detail-section">
              <h3>Content</h3>
              <div className="content-box">
                {selectedRecord.content}
              </div>
            </div>

            {provenance && (
              <div className="detail-section">
                <h3>Provenance & Sources</h3>
                <ul className="source-list">
                  {provenance.sources.map((src: any) => (
                    <li key={src.id} className="source-item">
                      <strong>{src.sourceType}</strong>
                      <p>{src.description}</p>
                      <span className="reliability">Reliability: {src.reliabilityScore}/100</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeTab === 'CANDIDATE' && (
              <div className="validation-actions">
                <h3>Governance Actions</h3>
                <div className="action-buttons">
                  <button className="btn-approve" onClick={() => handleValidate(selectedRecord.id, 'SUPPORTED')}>
                    Accept as Canonical Truth
                  </button>
                  <button className="btn-reject" onClick={() => handleValidate(selectedRecord.id, 'UNSUPPORTED')}>
                    Reject Candidate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .knowledge-page {
          padding: 2rem;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .page-header {
          margin-bottom: 2rem;
        }
        .page-header h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
          color: #fff;
        }
        .page-header p {
          color: #a0a0a0;
        }
        .tabs {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          border-bottom: 1px solid #333;
          padding-bottom: 0.5rem;
        }
        .tab {
          background: none;
          border: none;
          color: #888;
          font-size: 1.1rem;
          cursor: pointer;
          padding: 0.5rem 1rem;
          transition: all 0.2s;
        }
        .tab:hover {
          color: #ccc;
        }
        .tab.active {
          color: #fff;
          border-bottom: 2px solid #00ffcc;
        }
        .content-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          flex: 1;
          min-height: 0;
        }
        .knowledge-list {
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding-right: 1rem;
        }
        .knowledge-card {
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .knowledge-card:hover {
          border-color: #555;
          transform: translateY(-2px);
        }
        .knowledge-card.selected {
          border-color: #00ffcc;
          background: #252525;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .badge {
          background: #333;
          color: #ddd;
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: bold;
        }
        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: bold;
        }
        .status-canonical, .status-validated {
          background: rgba(0, 255, 204, 0.1);
          color: #00ffcc;
          border: 1px solid rgba(0, 255, 204, 0.2);
        }
        .status-candidate {
          background: rgba(255, 170, 0, 0.1);
          color: #ffaa00;
          border: 1px solid rgba(255, 170, 0, 0.2);
        }
        .knowledge-card h3 {
          margin-bottom: 0.5rem;
          color: #fff;
        }
        .summary {
          color: #aaa;
          font-size: 0.9rem;
          margin-bottom: 1rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-footer {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #888;
        }
        
        .knowledge-details {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 2rem;
          overflow-y: auto;
        }
        .knowledge-details h2 {
          color: #fff;
          font-size: 1.8rem;
          margin-bottom: 1rem;
        }
        .meta-info {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .detail-section {
          margin-bottom: 2rem;
        }
        .detail-section h3 {
          color: #ccc;
          margin-bottom: 1rem;
          font-size: 1.2rem;
        }
        .content-box {
          background: #222;
          padding: 1.5rem;
          border-radius: 8px;
          color: #ddd;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .source-list {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .source-item {
          background: #222;
          padding: 1rem;
          border-radius: 6px;
          border-left: 3px solid #00ffcc;
        }
        .source-item strong {
          color: #fff;
          display: block;
          margin-bottom: 0.5rem;
        }
        .source-item p {
          color: #aaa;
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
        }
        .reliability {
          font-size: 0.8rem;
          color: #888;
        }
        
        .validation-actions {
          background: rgba(255, 170, 0, 0.05);
          border: 1px solid rgba(255, 170, 0, 0.2);
          border-radius: 8px;
          padding: 1.5rem;
        }
        .action-buttons {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }
        .btn-approve {
          background: #00ffcc;
          color: #000;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-approve:hover {
          background: #00ccaa;
        }
        .btn-reject {
          background: transparent;
          color: #ff4444;
          border: 1px solid #ff4444;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-reject:hover {
          background: rgba(255, 68, 68, 0.1);
        }
        
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: #666;
          background: #1a1a1a;
          border-radius: 8px;
          border: 1px dashed #333;
        }
      `}</style>
    </div>
  );
}
