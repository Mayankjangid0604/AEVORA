import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { SpeakerHigh, CircleNotch, ArrowClockwise, Stop } from '@phosphor-icons/react';

export function VoiceProfileSection({ employeeId }: { employeeId: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const fetchProfile = async () => {
    setLoading(true);
    const { data, error } = await api.voiceProfile(employeeId);
    if (error) setError(error);
    else {
      setProfile(data);
      setEditForm({
        enabled: data.enabled,
        pitch: data.pitch,
        speakingRate: data.speakingRate,
        provider: data.provider,
        voiceId: data.voiceId,
        providerVoiceId: data.providerVoiceId,
        voiceFamily: data.voiceFamily,
        warmth: data.warmth ?? 1.0,
        authority: data.authority ?? 1.0,
        energy: data.energy ?? 1.0,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, [employeeId]);

  const [previewEmotion, setPreviewEmotion] = useState('NORMAL');
  const [previewIntensity, setPreviewIntensity] = useState(1.0);

  const testVoice = async (customText?: string, context?: any) => {
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    setPlaying(true);
    setSuccessMsg('');
    setError(null);
    try {
      const textToSay = customText || "Hello. This is a voice test for this employee.";
      const { data, error: genError } = await api.voiceGenerate(employeeId, textToSay, context);
      if (genError) throw new Error(genError);
      
      window.speechSynthesis.cancel();

      if (data.audioBase64 && !data.browserFallback) {
        try {
          const audio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
          audio.onended = () => setPlaying(false);
          audio.onerror = () => {
            console.error("Audio playback error, falling back to browser TTS");
            playFallback({ ...data, text: textToSay });
          };
          await audio.play();
          return;
        } catch (e) {
          console.error("Audio instantiation failed, falling back to browser TTS", e);
          playFallback({ ...data, text: textToSay });
        }
      } else {
        playFallback({ ...data, text: textToSay });
      }
    } catch (e: any) {
      setError(e.message);
      setPlaying(false);
    }
  };

  const playFallback = (data: any) => {
    if (!('speechSynthesis' in window)) {
      setError('Web Speech API is not supported in this browser.');
      setPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(data.text || "Hello. This is a voice test for this employee.");
    utterance.lang = data.language || 'en-IN';
    utterance.pitch = data.pitch || 1.0;
    utterance.rate = data.rate || 1.0;
    
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const resetAssignment = async () => {
    setActionLoading(true);
    setSuccessMsg('');
    setError(null);
    const { error: resetErr } = await api.voiceAssign(employeeId);
    if (resetErr) {
      setError(resetErr);
    } else {
      setSuccessMsg('Voice automatically assigned/regenerated successfully.');
      await fetchProfile();
    }
    setActionLoading(false);
  };

  const provisionVoice = async () => {
    setActionLoading(true);
    setSuccessMsg('');
    setError(null);
    try {
      const res = await fetch(`/api/voice-profile/${employeeId}/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccessMsg('Voice provisioned successfully.');
      await fetchProfile();
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading(false);
  };

  const saveOverrides = async () => {
    setActionLoading(true);
    setSuccessMsg('');
    setError(null);
    const { error: err } = await api.voiceUpdate(employeeId, {
      enabled: editForm.enabled,
      pitch: Number(editForm.pitch),
      speakingRate: Number(editForm.speakingRate),
      provider: editForm.provider,
      voiceId: editForm.voiceId,
      providerVoiceId: editForm.providerVoiceId,
      voiceFamily: editForm.voiceFamily,
      warmth: Number(editForm.warmth),
      authority: Number(editForm.authority),
      energy: Number(editForm.energy),
      formality: Number(editForm.formality),
    });
    
    if (err) {
      setError(err);
    } else {
      setSuccessMsg('Voice profile updated successfully.');
      setIsEditing(false);
      await fetchProfile();
    }
    setActionLoading(false);
  };

  if (loading) return <div className="state-loading">Loading voice profile…</div>;
  if (error && !profile) return <div className="state-error">⚠ {error}</div>;

  const roleLevel = profile?.employee?.role?.level || 1;

  return (
    <div className="section">
      <div className="flex-between" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ margin: 0 }}>Voice Identity</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {successMsg && <span style={{ color: 'var(--text-success)', fontSize: '0.85rem' }}>{successMsg}</span>}
          {error && profile && <span style={{ color: 'var(--text-danger)', fontSize: '0.85rem' }}>{error}</span>}
          
          {!isEditing ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>Edit</button>
          ) : (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn btn-primary btn-sm" onClick={saveOverrides} disabled={actionLoading}>Save</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)} disabled={actionLoading}>Cancel</button>
            </div>
          )}

          <button 
            className="btn btn-secondary btn-sm"
            onClick={resetAssignment} 
            disabled={actionLoading || playing || isEditing}
            title="Regenerate Voice Profile"
          >
            {actionLoading ? <CircleNotch className="spin" /> : <ArrowClockwise />}
          </button>

          <button 
            className="btn btn-secondary btn-sm"
            onClick={provisionVoice} 
            disabled={actionLoading || playing || isEditing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            Provision ElevenLabs
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--border)', padding: '0.25rem', borderRadius: '4px' }}>
            <select 
              className="input-sm" 
              value={previewEmotion} 
              onChange={e => setPreviewEmotion(e.target.value)}
              disabled={actionLoading || playing || isEditing}
              style={{ padding: '0.15rem' }}
            >
              {['NORMAL', 'URGENT', 'HAPPY', 'CONCERNED', 'EXCITED', 'FRUSTRATED', 'CONFIDENT', 'SYMPATHETIC', 'FORMAL'].map(em => (
                <option key={em} value={em}>{em}</option>
              ))}
            </select>
            <input 
              type="range" 
              min="0" max="100" 
              value={previewIntensity * 100} 
              onChange={e => setPreviewIntensity(Number(e.target.value) / 100)}
              disabled={actionLoading || playing || isEditing}
              title={`Intensity: ${Math.round(previewIntensity * 100)}%`}
              style={{ width: '60px' }}
            />
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => testVoice(`Hello, this is a preview of the ${profile?.voiceFamily || 'standard'} character voice.`, { emotion: previewEmotion, emotionIntensity: previewIntensity })} 
              disabled={actionLoading || (!profile?.enabled && !playing) || isEditing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              {playing ? <Stop /> : <SpeakerHigh />}
              {playing ? 'Stop' : 'Preview'}
            </button>
          </div>

          <button 
            className="btn btn-primary btn-sm" 
            onClick={() => testVoice()} 
            disabled={actionLoading || (!profile?.enabled && !playing) || isEditing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            {playing ? <Stop /> : <SpeakerHigh />}
            {playing ? 'Stop' : 'Test Voice'}
          </button>
        </div>
      </div>
      
      {!profile ? (
        <div className="state-empty">No voice profile assigned yet.</div>
      ) : (
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">Employee</div>
            <div className="detail-value">{profile.employee?.name || 'Unknown'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Department</div>
            <div className="detail-value">{profile.employee?.department?.name || 'Unknown'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Role</div>
            <div className="detail-value">{profile.employee?.role?.title || 'Unknown'} (Level {roleLevel})</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Status</div>
            {isEditing ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input type="checkbox" checked={editForm.enabled} onChange={e => setEditForm({ ...editForm, enabled: e.target.checked })} /> Enabled
              </label>
            ) : (
              <div className="detail-value" style={{ color: profile.enabled ? 'var(--text-success)' : 'var(--text-danger)' }}>
                {profile.enabled ? 'Enabled' : 'Disabled'}
              </div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Provider</div>
            {isEditing ? (
              <input type="text" className="input" value={editForm.provider} onChange={e => setEditForm({ ...editForm, provider: e.target.value })} />
            ) : (
              <div className="detail-value">{profile.provider}</div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Internal Voice ID</div>
            {isEditing ? (
              <input type="text" className="input" value={editForm.voiceId} onChange={e => setEditForm({ ...editForm, voiceId: e.target.value })} />
            ) : (
              <div className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{profile.voiceId || 'default'}</div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Provider Voice ID</div>
            {isEditing ? (
              <input type="text" className="input" value={editForm.providerVoiceId || ''} onChange={e => setEditForm({ ...editForm, providerVoiceId: e.target.value })} />
            ) : (
              <div className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{profile.providerVoiceId || 'None'}</div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Voice Family</div>
            {isEditing ? (
              <input type="text" className="input" value={editForm.voiceFamily || ''} onChange={e => setEditForm({ ...editForm, voiceFamily: e.target.value })} />
            ) : (
              <div className="detail-value">{profile.voiceFamily || 'neutral'}</div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Character Traits</div>
            <div className="detail-value" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.85rem' }}>
              <div>Warmth: {isEditing ? <input type="number" step="0.01" className="input" style={{width: '60px', padding: '2px'}} value={editForm.warmth} onChange={e => setEditForm({ ...editForm, warmth: Number(e.target.value) })} /> : profile.warmth ?? 1.0}</div>
              <div>Authority: {isEditing ? <input type="number" step="0.01" className="input" style={{width: '60px', padding: '2px'}} value={editForm.authority} onChange={e => setEditForm({ ...editForm, authority: Number(e.target.value) })} /> : profile.authority ?? 1.0}</div>
              <div>Energy: {isEditing ? <input type="number" step="0.01" className="input" style={{width: '60px', padding: '2px'}} value={editForm.energy} onChange={e => setEditForm({ ...editForm, energy: Number(e.target.value) })} /> : profile.energy ?? 1.0}</div>
              <div>Formality: {isEditing ? <input type="number" step="0.01" className="input" style={{width: '60px', padding: '2px'}} value={editForm.formality} onChange={e => setEditForm({ ...editForm, formality: Number(e.target.value) })} /> : profile.formality ?? 1.0}</div>
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Language</div>
            <div className="detail-value">{profile.language}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Speaking Style</div>
            <div className="detail-value">{profile.style || 'neutral'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Pitch</div>
            {isEditing ? (
              <input type="number" step="0.05" className="input" value={editForm.pitch} onChange={e => setEditForm({ ...editForm, pitch: e.target.value })} />
            ) : (
              <div className="detail-value">{profile.pitch.toFixed(2)}</div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Speaking Rate</div>
            {isEditing ? (
              <input type="number" step="0.05" className="input" value={editForm.speakingRate} onChange={e => setEditForm({ ...editForm, speakingRate: e.target.value })} />
            ) : (
              <div className="detail-value">{profile.speakingRate.toFixed(2)}</div>
            )}
          </div>
          <div className="detail-item">
            <div className="detail-label">Personality Influence</div>
            <div className="detail-value">{profile.personalityInfluence || '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Hierarchy Influence</div>
            <div className="detail-value">
              +{Math.min(25, roleLevel * 5)}% Authority, +{Math.min(15, roleLevel * 3)}% Formality, -{Math.min(0.1, roleLevel * 0.02).toFixed(2)} Pace
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
