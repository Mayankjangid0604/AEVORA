import { Injectable, Logger } from '@nestjs/common';
import { IVoiceProvider, VoiceGenerationOptions, VoiceGenerationResult } from '../voice-provider.interface';

@Injectable()
export class MockVoiceProvider implements IVoiceProvider {
  name = 'mock-premium';
  private readonly logger = new Logger(MockVoiceProvider.name);

  isAvailable(): boolean {
    const providerConfig = process.env.TTS_PROVIDER;
    const apiKey = process.env.TTS_API_KEY;
    
    // Available if configured explicitly in environment
    return providerConfig === 'mock' && !!apiKey;
  }

  async generateSpeech(options: VoiceGenerationOptions): Promise<VoiceGenerationResult> {
    this.logger.debug(`Generating mock server-side audio for voiceId: ${options.voiceId}`);
    
    // Simulate a fake tiny mp3 base64 (this is just an empty/invalid audio byte sequence for testing)
    const fakeAudioBase64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/+7BkAAQAAAgQAAAAAAP/7sGQAA';

    return {
      provider: this.name,
      audioBase64: fakeAudioBase64,
      mimeType: 'audio/mpeg',
      durationMs: 1500, // mock duration
      text: options.text,
      browserFallback: false, // We have successfully generated server audio
      language: options.language || 'en-US',
      pitch: options.pitch || 1.0,
      rate: options.speakingRate || 1.0,
      voiceId: options.voiceId || 'default'
    };
  }
}
