import { Module, forwardRef } from '@nestjs/common';
import { ProjectExecutionController } from './project-execution.controller';
import { ProjectExecutionService } from './project-execution.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskModule } from '../task/task.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SoftwareExecutionService } from './software-execution.service';

@Module({
  imports: [PrismaModule, forwardRef(() => TaskModule), KnowledgeModule],
  controllers: [ProjectExecutionController],
  providers: [ProjectExecutionService, SoftwareExecutionService],
  exports: [ProjectExecutionService, SoftwareExecutionService],
})
export class ProjectExecutionModule {}
