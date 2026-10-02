'use client';

import React, { useEffect, useRef, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { Microphone, MicrophoneSlash, SpeakerHigh, SpeakerSlash, Play, Stop, WarningCircle } from '@phosphor-icons/react';

interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  intent?: any;
  status?: string;
  createdAt: string;
  voiceResult?: any;
}

interface RoutingInfo {
  targetType?: string;
  targetName?: string | null;
  department?: string | null;
  riskLevel?: string;
  confidence?: string;
  taskId?: string | null;
  approvalRequired?: boolean;
  status?: string;
  contextUsed?: boolean;
  referencedEntity?: string | null;
}

interface PcTask {
  id: string;
  taskType: string;
  instruction: string;
  createdAt: string;
}

const QUICK_COMMANDS = [
  'Brief me',
  'What needs my attention?',
  "Today's company summary",
  'Company overview',
  'Status report',
  'Check revenue',
  'Sales pipeline',
  'Find new leads',
  'Ask CEO: what is the biggest bottleneck?',
  'Ask the Sales Lead why revenue dropped',
  'Tell the HR Lead to start recruiting',
];

function taskSummary(task: PcTask): string {
  try {
    const parsed = JSON.parse(task.instruction || '{}');
    return String(parsed.message ?? task.instruction).substring(0, 60);
  } catch {
    return task.instruction.substring(0, 60);
  }
}

function formatBriefingContent(content: string, intentName: string | false): React.ReactNode {
  const isBriefing = intentName === 'CHAIRMAN_BRIEFING' || intentName === 'ATTENTION_REPORT';
  if (!isBriefing || !content.includes('\n')) return content;
  return content.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={i} />;
    if (trimmed.startsWith('CRITICAL')) return <div key={i} style={{ color: '#ef4444', fontWeight: 600, marginTop: 8 }}>{trimmed}</div>;
    if (trimmed.startsWith('NEEDS ATTENTION') || trimmed.startsWith('HIGH PRIORITY')) return <div key={i} style={{ color: '#f59e0b', fontWeight: 600, marginTop: 8 }}>{trimmed}</div>;
    if (trimmed.startsWith('⚠')) return <div key={i} style={{ color: '#ef4444', paddingLeft: 8 }}>{trimmed}</div>;
    if (trimmed.startsWith('•')) return <div key={i} style={{ paddingLeft: 8 }}>{trimmed}</div>;
    if (/^(Sales|Finance|People|Operations|Decisions|Last 24h):/.test(trimmed)) return <div key={i} style={{ marginTop: 4, opacity: 0.85 }}>{trimmed}</div>;
    if (trimmed.startsWith('Executive Briefing') || trimmed.startsWith('Items Requiring')) return <div key={i} style={{ fontWeight: 700, fontSize: '1.05em' }}>{trimmed}</div>;
    if (trimmed.startsWith('Total:')) return <div key={i} style={{ marginTop: 8, fontWeight: 600 }}>{trimmed}</div>;
    return <div key={i}>{trimmed}</div>;
  });
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pcTasks, setPcTasks] = useState<PcTask[]>([]);
  const [lastResponseTime, setLastResponseTime] = useState<number | null>(null);
  const [lastRouting, setLastRouting] = useState<RoutingInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // VOICE STATE
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  async function loadMessages() {
    const { data } = await chairmanFetch<Message[]>('/assistant/messages');
    if (data) setMessages([...data].reverse());
  }

  async function loadPcTasks() {
    const { data } = await chairmanFetch<PcTask[]>('/assistant/pc-tasks');
    if (data) setPcTasks(data);
  }

  useEffect(() => {
    loadMessages();
    loadPcTasks();
    const interval = setInterval(() => {
      loadMessages();
      loadPcTasks();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onstart = () => {
          setIsListening(true);
          setSpeechError(null);
        };
        
        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          
          if (finalTranscript) {
             setInput(prev => {
                const space = prev && !prev.endsWith(' ') ? ' ' : '';
                return prev + space + finalTranscript;
             });
          }
        };
        
        recognitionRef.current.onerror = (event: any) => {
          setSpeechError(`Microphone error: ${event.error}`);
          setIsListening(false);
        };
        
        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
    
    return () => stopAudio();
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        setSpeechError("Speech recognition is not supported in this browser.");
        return;
      }
      try {
        recognitionRef.current.start();
      } catch (err: any) {
        setSpeechError(`Error starting microphone: ${err.message}`);
      }
    }
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  };
  
  const playTTS = (text: string, voiceResult?: any) => {
    stopAudio();
    if (!text) return;
    setIsPlaying(true);
    
    if (voiceResult?.audioBase64) {
       const audio = new Audio(`data:${voiceResult.mimeType || 'audio/mpeg'};base64,${voiceResult.audioBase64}`);
       currentAudioRef.current = audio;
       audio.onended = () => setIsPlaying(false);
       audio.onerror = () => {
         setIsPlaying(false);
         fallbackTTS(text);
       };
       audio.play().catch(() => fallbackTTS(text));
    } else {
       fallbackTTS(text);
    }
  };
  
  const fallbackTTS = (text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
       // Just plain TTS
       const utterance = new SpeechSynthesisUtterance(text);
       utterance.onend = () => setIsPlaying(false);
       utterance.onerror = () => setIsPlaying(false);
       window.speechSynthesis.speak(utterance);
    } else {
       setIsPlaying(false);
    }
  };

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    if (isListening) recognitionRef.current?.stop();
    setInput('');
    setLoading(true);
    setSpeechError(null);
    setMessages((prev) => [...prev, { id: 'temp', from: 'CHAIRMAN', to: 'ASSISTANT', content: msg, createdAt: new Date().toISOString() }]);

    const startTime = Date.now();
    const { data, error } = await chairmanFetch<{ response: string; intent: string; voiceResult?: any; routing?: RoutingInfo }>('/assistant/message', { method: 'POST', body: { message: msg } });
    setLastResponseTime(Date.now() - startTime);
    if (data?.routing) setLastRouting(data.routing);
    if (error) {
      setMessages((prev) => [...prev, { id: 'err', from: 'ASSISTANT', to: 'CHAIRMAN', content: `Error: ${error}`, createdAt: new Date().toISOString() }]);
      if (ttsEnabled) playTTS(`Error: ${error}`);
    } else {
      if (data && data.response && ttsEnabled) {
         playTTS(data.response, data.voiceResult);
      }
      await Promise.all([loadMessages(), loadPcTasks()]);
    }
    setLoading(false);
  }
  
  const replayLastMessage = () => {
    if (messages.length === 0) return;
    const lastAssistantMessage = messages.slice().reverse().find(m => m.from === 'ASSISTANT');
    if (lastAssistantMessage) {
        playTTS(lastAssistantMessage.content, lastAssistantMessage.voiceResult);
    }
  };

  return (
    <div className="assistant-page">
      <div className="assistant-chat">
        <div className="assistant-chat-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1>SAAHVIK Assistant</h1>
              <p>Your personal AI — talks to CEO, employees, and controls the company</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={() => {
                   setTtsEnabled(!ttsEnabled);
                   if (ttsEnabled) stopAudio();
                }} 
                className={`assistant-chip ${ttsEnabled ? 'active' : ''}`}
                title="Toggle Voice Output"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {ttsEnabled ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />} 
                {ttsEnabled ? 'Voice On' : 'Voice Off'}
              </button>
              {ttsEnabled && (
                  <>
                    <button onClick={replayLastMessage} className="assistant-chip" title="Replay Last Response"><Play size={16} /></button>
                    {isPlaying && <button onClick={stopAudio} className="assistant-chip active" title="Stop Audio" style={{ background: '#ef4444' }}><Stop size={16} /></button>}
                  </>
              )}
            </div>
          </div>
          {lastResponseTime !== null && (
            <p className="assistant-hint" style={{ textAlign: 'left', margin: '6px 0 0' }}>
              Last response:{' '}
              {lastResponseTime < 1000
                ? `${lastResponseTime} ms`
                : `${(lastResponseTime / 1000).toFixed(1)} s${lastResponseTime > 5000 ? ' (model call)' : ''}`}
            </p>
          )}
          {lastRouting && (
            <div className="assistant-routing" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
              {lastRouting.targetName && <span>→ {lastRouting.targetName}</span>}
              {lastRouting.department && <span style={{ color: 'var(--text-muted)' }}>({lastRouting.department})</span>}
              {lastRouting.status && (
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem',
                  background: lastRouting.status === 'executed' ? 'var(--success, #22c55e)' : lastRouting.status === 'approval_required' ? 'var(--warning, #e6a700)' : lastRouting.status === 'failed' ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
                  color: '#fff',
                }}>{lastRouting.status.replace(/_/g, ' ')}</span>
              )}
              {lastRouting.approvalRequired && <span style={{ color: 'var(--warning, #e6a700)' }}>⚠ approval needed</span>}
              {lastRouting.taskId && <span style={{ color: 'var(--text-muted)' }}>task: {lastRouting.taskId.slice(0, 8)}…</span>}
              {lastRouting.confidence && <span style={{ color: 'var(--text-muted)' }}>confidence: {lastRouting.confidence.toLowerCase()}</span>}
              {lastRouting.riskLevel && lastRouting.riskLevel !== 'LOW' && <span style={{ color: lastRouting.riskLevel === 'HIGH' ? 'var(--danger, #ef4444)' : 'var(--warning, #e6a700)' }}>risk: {lastRouting.riskLevel.toLowerCase()}</span>}
              {lastRouting.contextUsed && <span style={{ color: 'var(--text-muted)' }}>using context</span>}
              {lastRouting.referencedEntity && <span style={{ color: 'var(--text-muted)' }}>ref: {lastRouting.referencedEntity}</span>}
            </div>
          )}
        </div>

        <div className="assistant-log" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">Assistant ready</div>
              <div className="empty-state-desc">Type a command, use voice, or click the quick buttons below.</div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isEmployee = msg.to?.startsWith('EMPLOYEE:') || msg.from?.startsWith('EMPLOYEE:');
            const intentName = typeof msg.intent === 'object' && msg.intent?.intent;
            const isPending = msg.status === 'PENDING';
            return (
              <div key={msg.id + i} className={`assistant-msg${msg.from === 'CHAIRMAN' ? ' mine' : ''}${isEmployee ? ' employee-msg' : ''}`}>
                {msg.from !== 'CHAIRMAN' && <div className="who">{msg.from === 'ASSISTANT' ? 'Assistant' : msg.from.startsWith('EMPLOYEE:') ? 'Employee' : msg.from}</div>}
                <div className="body">{formatBriefingContent(msg.content, intentName)}</div>
                <div className="time">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                  {isPending && <span style={{ marginLeft: 8, color: 'var(--warning, #e6a700)' }}>⏳ pending</span>}
                  {intentName && ['ASK_EMPLOYEE', 'TELL_EMPLOYEE', 'CREATE_EMPLOYEE_TASK'].includes(intentName) && (
                    <span style={{ marginLeft: 8, opacity: 0.6 }}>→ employee</span>
                  )}
                </div>
              </div>
            );
          })}
          {loading && <div className="assistant-hint" style={{ textAlign: 'left' }}>Assistant is thinking…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="assistant-compose">
          {speechError && (
             <div style={{ color: '#fca5a5', background: '#7f1d1d', padding: '8px 12px', borderRadius: 6, marginBottom: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
               <WarningCircle size={16} /> {speechError}
             </div>
          )}
          <div className="assistant-quick">
            {QUICK_COMMANDS.map((cmd) => (
              <button key={cmd} onClick={() => setInput(cmd)} className="assistant-chip">{cmd}</button>
            ))}
          </div>
          <p className="assistant-hint" style={{ textAlign: 'left', margin: '0 0 8px' }}>
            Status/revenue responses are cached for 30 seconds
          </p>
          <div className="assistant-input-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button 
                onClick={toggleListen}
                className={`btn ${isListening ? 'btn-danger' : 'btn-secondary'}`}
                style={{ padding: '12px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: isListening ? 'pulse 1.5s infinite' : 'none' }}
                title={isListening ? "Stop listening" : "Start voice command"}
            >
                {isListening ? <Microphone size={20} weight="fill" /> : <MicrophoneSlash size={20} />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={isListening ? "Listening..." : "Tell the assistant what to do..."}
              aria-label="Message to assistant"
              className="assistant-input"
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()} className="btn btn-primary" style={{ flexShrink: 0 }}>
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {pcTasks.length > 0 && (
        <aside className="assistant-tasks">
          <div className="section-title">Pending PC Tasks ({pcTasks.length})</div>
          {pcTasks.map((task) => (
            <div key={task.id} className="assistant-task">
              <div className="type">{task.taskType}</div>
              <div style={{ marginTop: 4 }}>{taskSummary(task)}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{new Date(task.createdAt).toLocaleTimeString()}</div>
            </div>
          ))}
          <p className="assistant-hint" style={{ textAlign: 'left' }}>PC tasks need manual execution. Open Claude Code or browser to complete them.</p>
        </aside>
      )}
    </div>
  );
}
