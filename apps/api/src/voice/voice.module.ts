import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { BrowserVoiceProvider } from './providers/browser-voice.provider';
import { MockVoiceProvider } from './providers/mock-voice.provider';
import { SpeechStyleService } from './speech-style.service';
import { ModelGateway } from '@aevora/model-gateway';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { MockSttProvider } from './providers/mock-stt.provider';
import { CompanyConversationService } from './company-conversation.service';
import { CompanyConversationController } from './company-conversation.controller';
import { CompanyAutonomyService } from './company-autonomy.service';
import { CompanyMovementService } from './company-movement.service';

@Module({
  imports: [],
  providers: [VoiceService, BrowserVoiceProvider, MockVoiceProvider, ElevenLabsVoiceProvider, SpeechStyleService, MockSttProvider, CompanyConversationService, CompanyAutonomyService, CompanyMovementService, ModelGateway],
  controllers: [VoiceController, CompanyConversationController],
  exports: [VoiceService, SpeechStyleService, CompanyConversationService, CompanyAutonomyService, CompanyMovementService],
})
export class VoiceModule {}
