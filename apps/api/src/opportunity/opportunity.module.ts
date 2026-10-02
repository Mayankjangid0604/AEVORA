import { Module } from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { OpportunityController } from './opportunity.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OpportunityAssessmentService } from '../opportunity-assessment/opportunity-assessment.service';

@Module({
  imports: [PrismaModule],
  controllers: [OpportunityController],
  providers: [OpportunityService, OpportunityAssessmentService],
  exports: [OpportunityService, OpportunityAssessmentService]
})
export class OpportunityModule {}
