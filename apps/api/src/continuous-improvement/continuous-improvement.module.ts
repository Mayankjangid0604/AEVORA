import { Module } from '@nestjs/common';
import { ContinuousImprovementController } from './continuous-improvement.controller';
import { ContinuousImprovementService } from './continuous-improvement.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContinuousImprovementController],
  providers: [ContinuousImprovementService],
  exports: [ContinuousImprovementService],
})
export class ContinuousImprovementModule {}
