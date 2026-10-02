'use client';

import { useState, useEffect, useRef } from 'react';
import { api, openCompanyStream } from '../lib/api';
import { CompanyConversationPlayer } from './CompanyConversationPlayer';

export function CompanyAutonomyDashboard() {
  const [state, setState] = useState<'ACTIVE' | 'PAUSED' | 'DISABLED'>('DISABLED');
  const [feed, setFeed] = useState<any[]>([]);
  const [activeConversations, setActiveConversations] = useState<any[]>([]);
  const [sseStatus, setSseStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Load initial state
    api.autonomyStateGet().then(res => {
      if (res.data) setState(res.data.state);
    });

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const connectSSE = async () => {
    setSseStatus('CONNECTING');
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = await openCompanyStream();
    if (!es) { setSseStatus('DISCONNECTED'); setTimeout(connectSSE, 5000); return; }
    eventSourceRef.current = es;

    es.onopen = () => setSseStatus('CONNECTED');
    es.onerror = () => {
      setSseStatus('DISCONNECTED');
      es.close();
      setTimeout(connectSSE, 5000); // Reconnect
    };

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleStreamEvent(payload);
      } catch (e) {
        console.error("SSE parse error", e);
      }
    };
  };

  const handleStreamEvent = (evt: any) => {
    // Append to feed
    if (evt.type !== 'TURN_GENERATED') { // Keep feed clean from every individual turn
      setFeed(prev => [{ ...evt, id: Math.random().toString(36).substr(2, 9) }, ...prev].slice(0, 50));
    }

    if (evt.type === 'AUTONOMOUS_STATE_CHANGED') {
      setState(evt.payload.state);
    } else if (evt.type === 'CONVERSATION_STARTED') {
      setActiveConversations(prev => [...prev, { id: evt.conversationId, ...evt.payload }]);
    } else if (evt.type === 'CONVERSATION_COMPLETED') {
      setActiveConversations(prev => prev.filter(c => c.id !== evt.conversationId));
    } else if (evt.type === 'TURN_GENERATED') {
      // The CompanyConversationPlayer itself could listen, or we can just let it fetch updates. 
      // For a truly decoupled system, the Player would receive this SSE directly.
      // But we will use the `key` trick to force re-render or let the Player handle it.
      // In this version, we will just rely on the Player's own state if we want, but it's easier to just pass the event via an event bus or custom hook.
      window.dispatchEvent(new CustomEvent('aevora:voice-turn', { detail: evt }));
    }
  };

  const toggleState = async () => {
    const nextState = state === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await api.autonomyStateSet(nextState);
    setState(nextState);
  };

  const triggerMockEvent = async () => {
    await api.autonomyEventTrigger({
      priority: 'CRITICAL',
      topic: 'Database Failure',
      description: 'The main cluster in eu-central-1 is dropping connections.'
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Autonomous Company Life</h2>
          <div className="text-sm text-gray-400 mt-1">
            Status: <span className={`font-semibold ${state === 'ACTIVE' ? 'text-green-400' : state === 'PAUSED' ? 'text-yellow-400' : 'text-red-400'}`}>{state}</span>
            <span className="mx-2">•</span>
            SSE: <span className={sseStatus === 'CONNECTED' ? 'text-green-400' : 'text-red-400'}>{sseStatus}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className={`btn ${state === 'ACTIVE' ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleState}>
            {state === 'ACTIVE' ? 'Pause Autonomy' : 'Start Autonomy'}
          </button>
          <button className="btn btn-secondary" onClick={triggerMockEvent}>
            Trigger Critical Event
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-1/3 flex flex-col gap-4">
          <div className="card flex-1 overflow-y-auto max-h-[600px]">
            <h3 className="font-bold border-b border-gray-800 pb-2 mb-4">Activity Feed</h3>
            <div className="space-y-3">
              {feed.map(item => (
                <div key={item.id} className="text-sm border-l-2 border-gray-700 pl-3">
                  <div className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleTimeString()}</div>
                  <div className="font-semibold text-blue-400 mt-1">{item.type.replace(/_/g, ' ')}</div>
                  {item.payload?.topic && <div className="text-gray-300">{item.payload.topic}</div>}
                </div>
              ))}
              {feed.length === 0 && <div className="text-gray-500">No recent activity.</div>}
            </div>
          </div>
        </div>

        <div className="w-2/3 flex flex-col gap-4">
          {activeConversations.length > 0 ? (
            activeConversations.map(conv => (
              <div key={conv.id} className="border border-blue-900 rounded-xl overflow-hidden shadow-2xl">
                <div className="bg-blue-900/40 p-2 text-center text-xs font-bold text-blue-300 uppercase tracking-widest">
                  Live Autonomous Conversation
                </div>
                {/* We pass a prop indicating it should auto-play and listen to SSE */}
                <CompanyConversationPlayer conversationId={conv.id} autoPlay={true} />
              </div>
            ))
          ) : (
            <div className="card h-full flex flex-col items-center justify-center text-gray-500">
              <div className="text-4xl mb-4">🏢</div>
              <div>No active autonomous conversations.</div>
              <div className="text-sm mt-2">Wait for an event or trigger one manually.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
