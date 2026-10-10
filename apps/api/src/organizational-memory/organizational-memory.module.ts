import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalActionGatewayModule } from '../external-action-gateway/external-action-gateway.module';
import { ExecutiveMemoryService } from './executive-memory.service';
import { OutcomeEvaluationService } from './outcome-evaluation.service';
import { LessonPatternExtractionService } from './lesson-pattern-extraction.service';
import { StrategicReflectionService } from './strategic-reflection.service';
import { OrganizationalMemoryController } from './organizational-memory.controller';

@Module({
  imports: [PrismaModule, ExternalActionGatewayModule],
  providers: [
    ExecutiveMemoryService,
    OutcomeEvaluationService,
    LessonPatternExtractionService,
    StrategicReflectionService,
  ],
  controllers: [OrganizationalMemoryController],
  exports: [
    ExecutiveMemoryService,
    OutcomeEvaluationService,
    LessonPatternExtractionService,
    StrategicReflectionService,
  ],
})
export class OrganizationalMemoryModule {}
