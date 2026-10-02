'use client';

import { useCallback, useRef, useState } from 'react';
import { ChatCircle, CircleNotch, Microphone, SpeakerHigh, Stop, X, type Icon } from '@phosphor-icons/react';
import { chairmanFetch } from '../lib/api';

type AssistantState = 'idle' | 'listening' | 'processing' | 'speaking';

const stateIcons: Record<AssistantState, Icon> = {
  idle: Microphone,
  listening: Stop,
  processing: CircleNotch,
  speaking: SpeakerHigh,
};

const QUICK = ['Status report', 'Check revenue', 'Find leads', 'Ask CEO: what to focus on'];

/** Floating assistant: mic (Web Speech API) or typed commands → POST /assistant/message, reply is spoken. */
export default function VoiceButton() {
  const [state, setState] = useState<AssistantState>('idle');
  const [lastMessage, setLastMessage] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [textInput, setTextInput] = useState('');
  const recognitionRef = useRef<any>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    window.dispatchEvent(new CustomEvent('aevora:assistant-message', { detail: message })); // in-world tablet reaction
    if (!message.trim()) return;
    setState('processing');
    setLastMessage(message);
    const { data, error } = await chairmanFetch<{ response: string; voiceResult?: any }>('/assistant/message', { method: 'POST', body: { message } });
    if (!data) {
      setLastResponse(`Error: ${error}`);
      setState('idle');
      return;
    }
    const response = data.response || 'Done.';
    setLastResponse(response);
    
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const voiceResult = data.voiceResult;

    if (voiceResult?.audioBase64 && !voiceResult.browserFallback) {
      setState('speaking');
      const audioSrc = `data:${voiceResult.mimeType || 'audio/mpeg'};base64,${voiceResult.audioBase64}`;
      const audio = new Audio(audioSrc);
      audioRef.current = audio;
      
      audio.onended = () => setState('idle');
      audio.onerror = (e) => {
        console.error('Server audio playback failed, falling back to browser TTS', e);
        playBrowserTTS(response, voiceResult);
      };
      
      audio.play().catch(e => {
        console.error('Audio play blocked or failed:', e);
        playBrowserTTS(response, voiceResult);
      });
    } else {
      playBrowserTTS(response, voiceResult);
    }
  }, []);

  const playBrowserTTS = (text: string, voiceResult: any) => {
    if (!('speechSynthesis' in window)) {
      setState('idle');
      return;
    }
    setState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceResult?.language || 'en-IN';
    utterance.rate = voiceResult?.rate || 0.95;
    utterance.pitch = voiceResult?.pitch || 1.0;
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');
    window.speechSynthesis.speak(utterance);
  };

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setShowPanel(true);
      setLastResponse('Voice is not supported in this browser (use Chrome or Edge). You can type instead.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setState('listening');
    recognition.onresult = (event: any) => {
      recognition.stop();
      sendMessage(event.results[0][0].transcript);
    };
    recognition.onerror = () => setState('idle');
    // Functional update: this closure outlives the render it was created in.
    recognition.onend = () => setState((s) => (s === 'listening' ? 'idle' : s));
    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage]);

  const handleMicClick = useCallback(() => {
    if (state === 'listening') {
      recognitionRef.current?.stop();
      setState('idle');
    } else if (state === 'idle') {
      startListening();
    }
  }, [state, startListening]);

  const handleTextSend = useCallback(() => {
    if (textInput.trim()) {
      sendMessage(textInput.trim());
      setTextInput('');
    }
  }, [textInput, sendMessage]);

  return (
    <>
      <button onClick={handleMicClick} className="assistant-fab" data-state={state} title={`Assistant — ${state}`} aria-label={`Assistant microphone (${state})`}>
        {(() => { const StateIcon = stateIcons[state]; return <StateIcon size={22} weight="regular" aria-hidden="true" />; })()}
      </button>

      <button onClick={() => setShowPanel(!showPanel)} className="assistant-fab-toggle" title="Assistant panel" aria-label="Toggle assistant panel" aria-expanded={showPanel}>
        <ChatCircle size={18} aria-hidden="true" />
      </button>

      {showPanel && (
        <div className="assistant-panel" role="dialog" aria-label="SAAHVIK Assistant">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 14 }}>SAAHVIK Assistant</strong>
            <button onClick={() => setShowPanel(false)} className="close-btn" aria-label="Close"><X size={12} aria-hidden="true" /></button>
          </div>

          {lastMessage && (
            <>
              <div className="assistant-label">You said:</div>
              <div className="assistant-bubble">{lastMessage}</div>
            </>
          )}

          {lastResponse && (
            <>
              <div className="assistant-label">Assistant:</div>
              <div className="assistant-bubble reply">{lastResponse}</div>
            </>
          )}

          <div className="assistant-input-row">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSend()}
              placeholder="Type a command..."
              aria-label="Command"
              className="assistant-input"
            />
            <button onClick={handleTextSend} disabled={state === 'processing'} className="btn btn-primary btn-sm">Send</button>
          </div>

          <div className="assistant-quick">
            {QUICK.map((cmd) => (
              <button key={cmd} onClick={() => sendMessage(cmd)} disabled={state === 'processing'} className="assistant-chip">{cmd}</button>
            ))}
          </div>

          <div className="assistant-hint">
            {state === 'idle' && 'Click mic or type'}
            {state === 'listening' && 'Listening...'}
            {state === 'processing' && 'Processing...'}
            {state === 'speaking' && 'Speaking...'}
          </div>
        </div>
      )}
    </>
  );
}
