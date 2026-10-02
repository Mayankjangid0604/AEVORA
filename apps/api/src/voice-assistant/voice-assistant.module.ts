import { Module } from '@nestjs/common';
import { SimulationModule } from '../simulation/simulation.module';
import { VenturesModule } from '../ventures/ventures.module';
import { VoiceCommandService } from './voice-command.service';
import { VoiceAssistantController } from './voice-assistant.controller';
import { BoardroomModule } from '../boardroom/boardroom.module';

@Module({
  imports: [SimulationModule, VenturesModule, BoardroomModule],
  providers: [VoiceCommandService],
  controllers: [VoiceAssistantController],
  exports: [VoiceCommandService],
})
export class VoiceAssistantModule {}
