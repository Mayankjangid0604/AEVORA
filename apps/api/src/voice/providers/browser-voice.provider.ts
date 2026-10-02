import { Injectable } from '@nestjs/common';
import { IVoiceProvider, VoiceGenerationOptions, VoiceGenerationResult } from '../voice-provider.interface';

@Injectable()
export class BrowserVoiceProvider implements IVoiceProvider {
  name = 'browser';

  isAvailable(): boolean {
    return true; // Browser TTS is considered universally available (client-side implementation handles actual availability)
  }

  async generateSpeech(options: VoiceGenerationOptions): Promise<VoiceGenerationResult> {
    return {
      provider: this.name,
      text: options.text, // The client needs the text to pass to window.speechSynthesis
      browserFallback: true,
      language: options.language || 'en-US',
      pitch: options.pitch || 1.0,
      rate: options.speakingRate || 1.0,
      voiceId: options.voiceId
    };
  }
}
