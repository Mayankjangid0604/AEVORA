import { Injectable, Logger } from '@nestjs/common';
import { ISpeechToTextProvider, TranscriptionOptions, TranscriptionResult } from '../stt-provider.interface';

@Injectable()
export class MockSttProvider implements ISpeechToTextProvider {
  name = 'mock-stt';
  private readonly logger = new Logger(MockSttProvider.name);

  isAvailable(): boolean {
    const providerConfig = process.env.STT_PROVIDER;
    const apiKey = process.env.STT_API_KEY;
    // Available if configured explicitly in environment
    return providerConfig === 'mock' && !!apiKey;
  }

  async transcribe(options: TranscriptionOptions): Promise<TranscriptionResult> {
    this.logger.debug(`Transcribing mock audio of size: ${options.audioBuffer.length} bytes`);
    
    // Simulate processing time
    await new Promise(r => setTimeout(r, 500));

    // For mock, just return a fake string based on bytes
    return {
      text: "This is a mock transcription of the voice command.",
      confidence: 0.95,
      provider: this.name,
    };
  }
}
