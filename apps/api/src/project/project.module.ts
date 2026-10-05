import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [PrismaModule, ProductionModule],
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class ProjectModule {}
