import React, { useState, useEffect, useRef } from 'react';
import { WorldEntity, V12VoiceState, V12IntentType, V12IntentCategory, V12ResolvedIntent, V12EntityType, WorldMode } from '@aevora/shared';
import { API_BASE, authHeaders } from '../../app/lib/api';

interface HistoricalLookup {
  entity: WorldEntity | undefined;
  partial: boolean;
  available: boolean;
}

interface ExecutiveVoiceProps {
  entities: WorldEntity[];
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  viewMode: string;
  setViewMode: (mode: any) => void;
  worldMode?: WorldMode;
  companyId?: string | null;
  /** REPLAY only: resolves an entity from the replay engine's reconstructed historical state. */
  getHistoricalEntity?: (id: string) => HistoricalLookup;
}

export function ExecutiveVoice({ entities, selectedEntityId, onSelectEntity, viewMode, setViewMode, worldMode = WorldMode.LIVE, companyId = null, getHistoricalEntity }: ExecutiveVoiceProps) {
  const [state, setState] = useState<V12VoiceState>(V12VoiceState.IDLE);
  const [transcript, setTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Web Speech API
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onstart = () => {
        setState(V12VoiceState.LISTENING);
        setAssistantResponse('');
      };
      
      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        processVoiceCommand(text);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setState(V12VoiceState.FAILED);
          setAssistantResponse('Microphone access denied.');
        } else {
          setState(V12VoiceState.FAILED);
          setAssistantResponse(`Speech error: ${event.error}`);
        }
      };
      
      recognitionRef.current.onend = () => {
        if (state === V12VoiceState.LISTENING) {
          setState(V12VoiceState.IDLE);
        }
      };
    } else {
      setState(V12VoiceState.FAILED);
      setAssistantResponse('Browser speech recognition not supported.');
    }
  }, [state]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    
    if (state === V12VoiceState.LISTENING) {
      recognitionRef.current.stop();
      setState(V12VoiceState.IDLE);
    } else {
      setTranscript('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const processVoiceCommand = async (text: string) => {
    setState(V12VoiceState.UNDERSTANDING);
    const lower = text.toLowerCase();
    
    // Very simple local intent parser for UI actions
    let intent: V12ResolvedIntent | null = null;
    
    if (lower.includes('overhead view')) {
      intent = { intent: V12IntentType.SET_VIEW_MODE, category: V12IntentCategory.PRESENTATION, confidence: 1, parameters: { mode: 'overhead' } };
    } else if (lower.includes('first person')) {
      intent = { intent: V12IntentType.SET_VIEW_MODE, category: V12IntentCategory.PRESENTATION, confidence: 1, parameters: { mode: 'first-person' } };
    } else if (lower.includes('vehicle view')) {
      intent = { intent: V12IntentType.SET_VIEW_MODE, category: V12IntentCategory.PRESENTATION, confidence: 1, parameters: { mode: 'vehicle-exterior' } };
    } else if (lower.includes('who is this') || lower.includes('what is this')) {
      intent = { intent: V12IntentType.INSPECT_ENTITY, category: V12IntentCategory.READ_ONLY, confidence: 1, parameters: {} };
    } else if (lower.includes('take me to research')) {
      intent = { intent: V12IntentType.NAVIGATE_TO, category: V12IntentCategory.SPATIAL_NAVIGATION, confidence: 1, parameters: { targetName: 'Research' } };
    } else if (lower.includes('where is the ceo') || lower.includes('where is ceo')) {
      intent = { intent: V12IntentType.WHERE_IS_EMPLOYEE, category: V12IntentCategory.READ_ONLY, confidence: 1, parameters: { targetName: 'CEO' } };
    } else if (lower.includes('follow the ceo') || lower.includes('follow ceo')) {
      intent = { intent: V12IntentType.FOLLOW_ENTITY, category: V12IntentCategory.PRESENTATION, confidence: 1, parameters: { targetName: 'CEO' } };
    } else if (lower.includes('bring the ceo') || lower.includes('start a meeting') || lower.includes('call the ceo')) {
      intent = { intent: V12IntentType.BRING_EXECUTIVE, category: V12IntentCategory.CONSEQUENTIAL, confidence: 1, parameters: {} };
    } else if (lower.includes('follow him') || lower.includes('follow her')) {
      intent = { intent: V12IntentType.FOLLOW_ENTITY, category: V12IntentCategory.PRESENTATION, confidence: 0.9, parameters: { useSelected: true } };
    } else if (lower.includes('give me a briefing') || lower.includes('briefing')) {
      intent = { intent: 'GIVE_ME_A_BRIEFING' as any, category: V12IntentCategory.ASSISTANT, confidence: 1, parameters: {} };
    }

    if (!intent) {
      setState(V12VoiceState.AMBIGUOUS);
      setAssistantResponse("I didn't understand that command.");
      return;
    }

    setState(V12VoiceState.RESOLVING);

    // REPLAY is read-only and historical: answer inspection from reconstructed state only, never from live data.
    if (worldMode === WorldMode.REPLAY) {
      if (intent.category === V12IntentCategory.CONSEQUENTIAL || intent.category === V12IntentCategory.SPATIAL_NAVIGATION) {
        setState(V12VoiceState.REJECTED);
        setAssistantResponse('REPLAY_READ_ONLY: commands and movement are disabled while viewing historical replay.');
        return;
      }
      if (intent.intent === V12IntentType.INSPECT_ENTITY) {
        if (!selectedEntityId) {
          setState(V12VoiceState.AMBIGUOUS);
          setAssistantResponse('Select an entity on the replay timeline first.');
          return;
        }
        const h = getHistoricalEntity?.(selectedEntityId);
        if (!h || !h.available) {
          setState(V12VoiceState.FAILED);
          setAssistantResponse('Historical state is NOT AVAILABLE for this point.');
        } else if (!h.entity) {
          setState(V12VoiceState.COMPLETED);
          setAssistantResponse('That entity did not exist at this point in history.');
        } else {
          const e: any = h.entity;
          setState(V12VoiceState.COMPLETED);
          setAssistantResponse(`At this point in history: ${e.name ?? 'an unnamed entity'} (${e.type ?? 'type not recorded'})${h.partial ? ', spatial position not recorded' : ''}.`);
        }
        return;
      }
      if (intent.category === V12IntentCategory.ASSISTANT || intent.category === V12IntentCategory.READ_ONLY) {
        setState(V12VoiceState.UNSUPPORTED);
        setAssistantResponse('REPLAY_READ_ONLY: live enterprise lookups are disabled during replay; use the historical inspector.');
        return;
      }
    }
    // Execute Intent
    if (intent.category === V12IntentCategory.PRESENTATION) {
      if (intent.intent === V12IntentType.SET_VIEW_MODE) {
        setViewMode(intent.parameters.mode);
        setState(V12VoiceState.COMPLETED);
        setAssistantResponse(`Switched to ${intent.parameters.mode} view.`);
      } else if (intent.intent === V12IntentType.FOLLOW_ENTITY) {
        let targetId = null;
        if (intent.parameters.useSelected && selectedEntityId) {
          targetId = selectedEntityId;
        } else if (intent.parameters.targetName === 'CEO') {
           const ceoPerson = entities.find(e => e.type === V12EntityType.PERSON && (e.name.includes('CEO') || (e as any).aevoraType === 'CEO'));
           if (ceoPerson) targetId = ceoPerson.id;
        }
        
        if (targetId) {
          onSelectEntity(targetId);
          setViewMode('explore');
          setState(V12VoiceState.COMPLETED);
          setAssistantResponse('Following target.');
        } else {
          setState(V12VoiceState.FAILED);
          setAssistantResponse('Target could not be resolved in the current context.');
        }
      }
    } else if (intent.category === V12IntentCategory.SPATIAL_NAVIGATION) {
       if (intent.intent === V12IntentType.NAVIGATE_TO) {
         const target = entities.find(e => e.name.toLowerCase().includes(intent!.parameters.targetName.toLowerCase()));
         if (target) {
            onSelectEntity(target.id);
            setViewMode('explore');
            setState(V12VoiceState.COMPLETED);
            setAssistantResponse(`Taking you to ${target.name}.`);
         } else {
            setState(V12VoiceState.FAILED);
            setAssistantResponse(`${intent.parameters.targetName} could not be resolved in the current context.`);
         }
       }
    } else if (intent.category === V12IntentCategory.ASSISTANT || intent.category === V12IntentCategory.READ_ONLY) {
       setState(V12VoiceState.RESOLVING);
       setAssistantResponse("Let me check...");
       try {
         const selectedEntity = entities.find(e => e.id === selectedEntityId);
         if (!companyId) {
           setState(V12VoiceState.AMBIGUOUS);
           setAssistantResponse('Select a company first.');
           return;
         }
         
         const response = await fetch(`${API_BASE}/v12-assistant/ask`, {
           method: 'POST',
           headers: authHeaders(),
           body: JSON.stringify({
             intent: intent.intent,
             context: {
               selectedEntityId,
               selectedEntityType: selectedEntity ? selectedEntity.type : undefined,
               currentCompanyId: companyId,
               timestamp: new Date().toISOString(),
               correlationId: `corr_${Date.now()}`
             },
             parameters: intent.parameters,
             mode: worldMode
           })
         });
         
         if (!response.ok) {
           setState(V12VoiceState.FAILED);
           setAssistantResponse("Failed to query the assistant backend.");
           return;
         }
         
         const data = await response.json();
         if (data.status === 'SUCCESS') {
           setState(V12VoiceState.COMPLETED);
           setAssistantResponse(data.responseText);
         } else if (data.status === 'AMBIGUOUS') {
           setState(V12VoiceState.AMBIGUOUS);
           setAssistantResponse(data.responseText);
         } else if (data.status === 'UNSUPPORTED') {
           setState(V12VoiceState.UNSUPPORTED);
           setAssistantResponse(data.responseText);
         } else if (data.status === 'REPLAY_READ_ONLY') {
           setState(V12VoiceState.REJECTED);
           setAssistantResponse(`REPLAY_READ_ONLY: ${data.responseText}`);
         } else {
           setState(V12VoiceState.FAILED);
           setAssistantResponse(data.responseText || "An error occurred.");
         }
       } catch (error) {
         setState(V12VoiceState.FAILED);
         setAssistantResponse("Network error.");
       }
    } else if (intent.category === V12IntentCategory.CONSEQUENTIAL) {
       setState(V12VoiceState.AUTHORIZING);
       setAssistantResponse("Submitting request...");
       try {
         const response = await fetch(`${API_BASE}/v12-command/execute`, {
           method: 'POST',
           headers: authHeaders(),
           body: JSON.stringify({
             intent: intent.intent,
             context: {
               selectedEntityId
             },
             parameters: intent.parameters,
             mode: worldMode
           })
         });
         
         if (!response.ok) {
           if (response.status === 401 || response.status === 403) {
             setState(V12VoiceState.REJECTED);
             setAssistantResponse("Authorization was denied.");
           } else {
             setState(V12VoiceState.FAILED);
             setAssistantResponse("The request failed due to a server error.");
           }
           return;
         }
         
         const data = await response.json();
         
         if (data.status === 'UNSUPPORTED') {
           setState(V12VoiceState.UNSUPPORTED);
           setAssistantResponse("The backend does not currently support that action.");
         } else if (data.status === 'ACCEPTED') {
           setState(V12VoiceState.EXECUTING);
           setAssistantResponse("Authorization approved. Executing...");
         } else if (data.status === 'REJECTED') {
           setState(V12VoiceState.REJECTED);
           setAssistantResponse("I couldn't complete that request because you are not authorized.");
         } else if (data.status === 'REPLAY_READ_ONLY') {
           setState(V12VoiceState.REJECTED);
           setAssistantResponse(`REPLAY_READ_ONLY: ${data.message || 'commands are disabled during replay.'}`);
         } else {
           setState(V12VoiceState.FAILED);
           setAssistantResponse(data.message || "Command failed.");
         }
       } catch (error) {
         setState(V12VoiceState.FAILED);
         setAssistantResponse("Failed to connect to the backend.");
       }
    }
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      zIndex: 20
    }}>
      
      {(transcript || assistantResponse) && (
        <div style={{
          background: 'rgba(0,0,0,0.8)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '12px 24px',
          borderRadius: '8px',
          backdropFilter: 'blur(10px)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          {transcript && (
            <p style={{ color: '#d1d5db', margin: '0 0 8px 0', fontStyle: 'italic', fontSize: '14px' }}>"{transcript}"</p>
          )}
          {assistantResponse && (
            <p style={{ color: (state === V12VoiceState.REJECTED || state === V12VoiceState.FAILED || state === V12VoiceState.UNSUPPORTED) ? '#ef4444' : '#4ade80', margin: 0, fontWeight: '500' }}>
              {assistantResponse}
            </p>
          )}
          <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '4px', textTransform: 'uppercase' }}>
            STATUS: {state}
          </div>
        </div>
      )}

      <button
        onClick={toggleListening}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: state === V12VoiceState.LISTENING ? '#ef4444' : '#374151',
          border: '2px solid rgba(255,255,255,0.2)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: state === V12VoiceState.LISTENING ? '0 0 15px rgba(239, 68, 68, 0.5)' : 'none',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      </button>
    </div>
  );
}
