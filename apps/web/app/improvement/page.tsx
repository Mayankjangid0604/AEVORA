'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, PlayCircle, RotateCcw, AlertTriangle } from 'lucide-react';

const Card = ({ children, className }: any) => <div className={className}>{children}</div>;
const CardContent = ({ children, className }: any) => <div className={className}>{children}</div>;
const CardDescription = ({ children, className }: any) => <div className={className}>{children}</div>;
const CardHeader = ({ children, className }: any) => <div className={className}>{children}</div>;
const CardTitle = ({ children, className }: any) => <h2 className={className}>{children}</h2>;
const CardFooter = ({ children, className }: any) => <div className={className}>{children}</div>;
const Button = ({ children, onClick, className }: any) => <button onClick={onClick} className={className}>{children}</button>;
const Badge = ({ children, className }: any) => <span className={className}>{children}</span>;
const useToast = () => ({ toast: (msg: any) => console.log(msg) });

export default function ImprovementDashboard() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // We will hardcode a default company for demo, or fetch from context
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/company`);
      const companies = await res.json();
      if (companies.length > 0) {
        setActiveCompany(companies[0].id);
        fetchProposals(companies[0].id);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchProposals = async (companyId: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/continuous-improvement/company/${companyId}/proposals`);
      const data = await res.json();
      setProposals(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/continuous-improvement/proposals/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'Human Reviewer' })
      });
      if (res.ok) {
        toast({ title: `Proposal ${action}ed successfully.` });
        if (activeCompany) fetchProposals(activeCompany);
      } else {
        toast({ title: 'Action failed', variant: 'destructive' });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const generateProposal = async () => {
    if (!activeCompany) return;
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      
      // Simulate detection first
      await fetch(`${API_BASE}/continuous-improvement/company/${activeCompany}/detect`);
      
      const payload = {
        companyId: activeCompany,
        title: 'Optimize Internal Communication Sync',
        description: 'Agents are frequently polling memory context resulting in higher latency.',
        problem: 'Memory context polling overhead.',
        observedSignal: 'High token usage on unchanged tasks.',
        hypothesis: 'Caching memory context will reduce latency by 15%.',
        proposedChange: 'Implement Redis caching layer for agent context memory.',
        expectedImpact: 'Latency reduction',
        expectedMetric: 'Response time',
        baseline: 850,
        target: 650,
        confidence: 0.85,
        risk: 'LOW',
        priority: 'NORMAL'
      };

      const res = await fetch(`${API_BASE}/continuous-improvement/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast({ title: 'New Proposal Detected & Drafted!' });
        fetchProposals(activeCompany);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DETECTED': return 'bg-gray-500';
      case 'PROPOSED': return 'bg-blue-500';
      case 'UNDER_REVIEW': return 'bg-yellow-500';
      case 'APPROVED': return 'bg-green-500';
      case 'EXECUTING': return 'bg-purple-500';
      case 'COMPLETED': return 'bg-emerald-600';
      case 'REJECTED': return 'bg-red-500';
      case 'ROLLED_BACK': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">V10 Self-Evolution Engine</h1>
          <p className="text-gray-400 mt-2">Company-Wide Continuous Improvement & Self-Evolution Dashboard</p>
        </div>
        <Button onClick={generateProposal} className="bg-indigo-600 hover:bg-indigo-700">
          Run Analysis Cycle
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading engine state...</div>
      ) : proposals.length === 0 ? (
        <div className="text-center text-gray-500 py-12 bg-[#1a1b1e] rounded-lg border border-[#2a2b2e]">
          No active improvement proposals detected. System operating optimally.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proposals.map(p => (
            <Card key={p.id} className="bg-[#1a1b1e] border-[#2a2b2e] text-white">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge className={`${getStatusColor(p.status)} border-none text-white`}>{p.status}</Badge>
                  <span className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
                <CardTitle className="text-xl">{p.title}</CardTitle>
                <CardDescription className="text-gray-400 line-clamp-2">{p.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Signal</span>
                    <span className="font-medium text-amber-500">{p.observedSignal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expected Impact</span>
                    <span className="font-medium text-emerald-500">{p.expectedImpact}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Risk</span>
                    <span className="font-medium">{p.risk}</span>
                  </div>
                </div>
                
                {p.outcomes?.length > 0 && (
                  <div className="mt-4 p-3 bg-[#111214] rounded-md border border-[#2a2b2e]">
                    <p className="text-xs font-semibold text-gray-400 mb-1">Latest Outcome</p>
                    <p className="text-sm text-green-400">{p.outcomes[0].comparison}: {p.outcomes[0].learnedLesson}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-2 justify-end pt-4 border-t border-[#2a2b2e]">
                {p.status === 'PROPOSED' && (
                  <>
                    <Button size="sm" variant="outline" className="border-red-900 text-red-500 hover:bg-red-900/20" onClick={() => handleAction(p.id, 'reject')}>
                      Reject
                    </Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleAction(p.id, 'approve')}>
                      Approve & Execute
                    </Button>
                  </>
                )}
                {p.status === 'COMPLETED' && (
                  <Button size="sm" variant="outline" className="border-orange-900 text-orange-500 hover:bg-orange-900/20" onClick={() => handleAction(p.id, 'rollback')}>
                    Rollback
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
