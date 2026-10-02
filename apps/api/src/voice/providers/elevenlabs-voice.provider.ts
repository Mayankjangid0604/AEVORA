import { Injectable, Logger } from '@nestjs/common';
import { IVoiceProvider, VoiceGenerationOptions, VoiceGenerationResult } from '../voice-provider.interface';

@Injectable()
export class ElevenLabsVoiceProvider implements IVoiceProvider {
  name = 'elevenlabs';
  private readonly logger = new Logger(ElevenLabsVoiceProvider.name);

  // Hardcode fallback voice id just in case, though we will resolve it mostly
  private readonly DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // generic voice id placeholder

  isAvailable(): boolean {
    const providerConfig = process.env.TTS_PROVIDER;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    return providerConfig === 'elevenlabs' && !!apiKey;
  }

  async generateSpeech(options: VoiceGenerationOptions): Promise<VoiceGenerationResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const voiceId = options.voiceId || this.DEFAULT_VOICE_ID;
    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1';
    
    // Clean ElevenLabs mapping - do not map unsupported fields like 'pitch' directly to stability.
    // Normalized expressiveness mapped to ElevenLabs 'style' exaggeration if > 1.0
    const expressivenessStyle = options.expressiveness && options.expressiveness > 1.0 
      ? Math.min(1.0, (options.expressiveness - 1.0)) 
      : 0.0;
      
    // Use AEVORA's stability directly for ElevenLabs stability
    const stability = options.stability !== undefined ? Math.max(0.0, Math.min(1.0, options.stability)) : 0.7; 
    
    // Default similarity_boost to 0.7 as standard professional baseline
    const similarityBoost = 0.7;

    this.logger.debug(`Generating ElevenLabs speech for voiceId: ${voiceId}`);

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: options.text,
          model_id: modelId,
          voice_settings: {
            stability: stability,
            similarity_boost: similarityBoost,
            style: expressivenessStyle,
            use_speaker_boost: true
          }
        }),
        signal: AbortSignal.timeout(15000), // 15-second timeout to prevent stalling
      });

      if (!response.ok) {
        let errorData = '';
        try {
          errorData = await response.text();
        } catch (e) {}
        this.logger.error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorData}`);
        throw new Error(`ElevenLabs returned ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = buffer.toString('base64');

      return {
        provider: this.name,
        audioBase64: audioBase64,
        mimeType: 'audio/mpeg',
        text: options.text,
        browserFallback: false,
        language: options.language || 'en-US',
        pitch: options.pitch || 1.0,
        rate: options.speakingRate || 1.0,
        voiceId: voiceId
      };
    } catch (error) {
      this.logger.error(`ElevenLabs generation failed: ${error}`);
      
      // Return a safe fallback response so AEVORA doesn't crash
      return {
        provider: this.name,
        text: options.text,
        browserFallback: true,
        language: options.language || 'en-US',
        pitch: options.pitch || 1.0,
        rate: options.speakingRate || 1.0,
        voiceId: voiceId
      };
    }
  }
}
