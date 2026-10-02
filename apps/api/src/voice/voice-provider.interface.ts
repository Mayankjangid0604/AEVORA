export interface VoiceGenerationOptions {
  text: string;
  voiceId?: string;
  language?: string;
  pitch?: number;
  speakingRate?: number;
  stability?: number;
  expressiveness?: number;
  warmth?: number;
  authority?: number;
  energy?: number;
  formality?: number;
}

export interface VoiceGenerationResult {
  provider: string;
  audioUrl?: string; // If a server-side provider uploads to a CDN/S3
  audioBase64?: string; // Inline audio for direct client playback without storage
  mimeType?: string; // e.g., 'audio/mpeg'
  durationMs?: number;
  text?: string;
  browserFallback?: boolean; // Instructs client to use browser TTS if true
  language?: string;
  pitch?: number;
  rate?: number;
  voiceId?: string;
}

export interface IVoiceProvider {
  name: string;
  generateSpeech(options: VoiceGenerationOptions): Promise<VoiceGenerationResult>;
  isAvailable(): boolean;
}
