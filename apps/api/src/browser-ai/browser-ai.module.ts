import { Module } from '@nestjs/common';
import { BrowserWorkerService } from './browser-worker.service';
import { BrowserConversationService } from './browser-conversation.service';
import { BrowserGatewayAdapter } from './browser-gateway.adapter';
import { BrowserAiController } from './browser-ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [PrismaModule, JobModule],
  controllers: [BrowserAiController],
  providers: [BrowserWorkerService, BrowserConversationService, BrowserGatewayAdapter],
  exports: [BrowserWorkerService, BrowserConversationService],
})
export class BrowserAiModule {}
