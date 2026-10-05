import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationService } from './communication.service';
import { MessageService } from './message.service';
import { ConversationService } from './conversation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MeetingService } from './meeting.service';
import { NotificationService } from './notification.service';
import { RelationshipService } from './relationship.service';
import { CommunicationMemoryService } from './communication-memory.service';
import { SimulationModule } from '../simulation/simulation.module';
import { ProductionModule } from '../production/production.module';
@Module({
  imports: [forwardRef(() => SimulationModule), ProductionModule],
  providers: [
    PrismaService,
    CommunicationService,
    MessageService,
    ConversationService,
    MeetingService,
    NotificationService,
    RelationshipService,
    CommunicationMemoryService,
  ],
  exports: [
    CommunicationService,
    MessageService,
    ConversationService,
    MeetingService,
    NotificationService,
    RelationshipService,
    CommunicationMemoryService,
  ],
})
export class CommunicationModule {}
