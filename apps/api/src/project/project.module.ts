import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectFlowService } from './project-flow.service';
import { ProjectController } from './project.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [PrismaModule, ProductionModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectFlowService],
  exports: [ProjectFlowService],
})
export class ProjectModule {}
