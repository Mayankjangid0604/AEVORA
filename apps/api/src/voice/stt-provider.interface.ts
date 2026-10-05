export interface TranscriptionOptions {
  audioBuffer: Buffer;
  mimeType: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  provider: string;
}

export interface ISpeechToTextProvider {
  name: string;
  isAvailable(): boolean;
  transcribe(options: TranscriptionOptions): Promise<TranscriptionResult>;
}
