'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { SpeakerHigh, Play, Stop, CircleNotch } from '@phosphor-icons/react';

interface CompanyConversationPlayerProps {
  conversationId?: string;
  autoPlay?: boolean;
}

export function CompanyConversationPlayer({ conversationId, autoPlay = false }: CompanyConversationPlayerProps) {
  const [conv, setConv] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [activeTurn, setActiveTurn] = useState<any>(null);

  useEffect(() => {
    if (conversationId) {
      loadConversation();
    }
  }, [conversationId]);

  const loadConversation = async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data, error } = await api.companyConversationGet(conversationId);
    if (error) setError(error);
    else setConv(data);
    setLoading(false);
  };

  const playTurn = async (turn: any) => {
    if (!turn) return;
    setActiveTurn(turn);
    setPlaying(true);
    
    return new Promise<void>((resolve) => {
      const { audioResult } = turn;
      if (!audioResult) {
        resolve();
        return;
      }

      if (audioResult.browserFallback || !audioResult.audioBase64) {
        // Fallback to browser TTS
        if (!('speechSynthesis' in window)) {
          console.error("Browser TTS not supported.");
          resolve();
          return;
        }
        
        window.speechSynthesis.cancel(); // clear previous
        const utterance = new SpeechSynthesisUtterance(audioResult.text || turn.text);
        utterance.lang = audioResult.language || 'en-US';
        utterance.pitch = audioResult.pitch || 1.0;
        utterance.rate = audioResult.rate || 1.0;
        
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve(); // continue on error to not block queue
        
        synthesisRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
        // Play ElevenLabs or standard API audio
        try {
          const audio = new Audio(`data:${audioResult.mimeType || 'audio/mpeg'};base64,${audioResult.audioBase64}`);
          audio.onended = () => resolve();
          audio.onerror = (e) => {
            console.error("Audio playback error", e);
            resolve();
          };
          
          audioRef.current = audio;
          audio.play().catch(e => {
            console.error("Audio play blocked", e);
            resolve();
          });
        } catch (e) {
          console.error("Audio load failed", e);
          resolve();
        }
      }
    });
  };

  const stopPlayback = () => {
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveTurn(null);
  };

  const handleNextTurn = async () => {
    if (!conv || conv.status !== 'ACTIVE') return;
    setGenerating(true);
    setError(null);
    try {
      const { data, error } = await api.companyConversationTurn(conv.id);
      if (error) throw new Error(error);
      
      // Add turn to UI state
      setConv((prev: any) => ({ ...prev, turns: [...prev.turns, data] }));
      
      // Play newly generated turn
      await playTurn(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
      setActiveTurn(null);
      setPlaying(false);
    }
  };

  useEffect(() => {
    if (!autoPlay) return;

    const handleTurn = (e: any) => {
      const evt = e.detail;
      if (evt.conversationId === conversationId && evt.type === 'TURN_GENERATED') {
        setConv((prev: any) => {
          if (!prev) return prev;
          // Prevent duplicates
          if (prev.turns.find((t: any) => t.id === evt.payload.id)) return prev;
          return { ...prev, turns: [...prev.turns, evt.payload] };
        });
        
        // Wait for state to update, then play
        setTimeout(() => playTurn(evt.payload), 100);
      }
    };

    window.addEventListener('aevora:voice-turn', handleTurn);
    return () => window.removeEventListener('aevora:voice-turn', handleTurn);
  }, [autoPlay, conversationId]);

  if (!conv) return loading ? <div>Loading conversation...</div> : null;

  return (
    <div className="card w-full max-w-4xl mx-auto flex flex-col h-full max-h-[80vh]">
      <div className="flex-between border-b border-gray-800 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-bold">{conv.subject}</h2>
          <div className="text-sm text-gray-400">Context: {conv.eventContext}</div>
          <div className="text-xs mt-1">Urgency: <span className={conv.urgency === 'URGENT' || conv.urgency === 'CRITICAL' ? 'text-red-400' : 'text-blue-400'}>{conv.urgency}</span></div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={stopPlayback} disabled={!playing}>
            <Stop /> Stop
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleNextTurn} disabled={generating || playing || conv.status !== 'ACTIVE'}>
            {generating ? <CircleNotch className="spin" /> : <Play />} Next Turn
          </button>
        </div>
      </div>

      <div className="flex gap-6 h-full min-h-[300px] overflow-hidden">
        {/* Active Speaker UI */}
        <div className="w-1/3 border-r border-gray-800 pr-4">
          <h3 className="font-semibold text-sm mb-4 text-gray-400">ACTIVE SPEAKER</h3>
          {activeTurn ? (
            <div className="bg-slate-900 border border-blue-500/30 p-4 rounded-lg shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/5 animate-pulse"></div>
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                  <SpeakerHigh size={32} className="text-blue-400 animate-bounce" />
                </div>
                <div className="font-bold text-lg">{activeTurn.speakerName}</div>
                <div className="text-sm text-gray-300">{activeTurn.speakerRole}</div>
                <div className="text-xs text-blue-400 mt-1">{activeTurn.speakerDepartment}</div>
                
                <div className="mt-4 px-3 py-1 bg-slate-800 rounded-full text-xs font-mono border border-gray-700 inline-block">
                  State: {activeTurn.context?.emotion || 'NORMAL'}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 border border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
              {conv.status === 'ACTIVE' ? 'Waiting for speaker...' : 'Conversation Ended'}
            </div>
          )}
          
          <div className="mt-6">
            <h3 className="font-semibold text-sm mb-2 text-gray-400">PARTICIPANTS</h3>
            <ul className="space-y-2">
              {conv.participants.map((p: any) => (
                <li key={p.id} className="text-sm flex flex-col p-2 bg-slate-900 rounded">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.roleTitle}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Transcript */}
        <div className="w-2/3 flex flex-col overflow-y-auto pr-2">
          <h3 className="font-semibold text-sm mb-4 text-gray-400">TRANSCRIPT</h3>
          {error && <div className="text-red-500 mb-4 p-2 bg-red-900/20 rounded">⚠ {error}</div>}
          
          <div className="space-y-4">
            {conv.turns.map((turn: any) => (
              <div key={turn.id} className={`p-4 rounded-lg border ${activeTurn?.id === turn.id ? 'bg-slate-800 border-blue-500/50' : 'bg-slate-900 border-gray-800'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-bold mr-2">{turn.speakerName}</span>
                    <span className="text-xs text-gray-500">{new Date(turn.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {activeTurn?.id === turn.id && <span className="flex items-center gap-1 text-xs text-blue-400"><SpeakerHigh className="animate-pulse" /> Speaking</span>}
                </div>
                <div className="text-gray-200">{turn.text}</div>
                {turn.audioResult?.browserFallback && (
                  <div className="text-[10px] text-yellow-500 mt-2">Browser TTS Fallback</div>
                )}
              </div>
            ))}
            {conv.turns.length === 0 && !generating && (
              <div className="text-center text-gray-500 mt-10">
                Click &quot;Next Turn&quot; to start the conversation.
              </div>
            )}
            {generating && (
              <div className="p-4 rounded-lg bg-slate-900 border border-gray-800 flex items-center justify-center text-gray-400">
                <CircleNotch size={24} className="spin mr-2" /> Generating next turn...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
